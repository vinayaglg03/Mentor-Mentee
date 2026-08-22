import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { scrub, scrubEvent } from '../src/lib/monitoring.js';
import { topPerformers, passFailCounts, atRiskStudents, quietStudents } from '../src/lib/analyticsQueries.js';
import {
  prisma, resetDatabase, createUser, createStudent, createSubject, createHod,
  createSuperAdmin, authHeader,
} from './helpers.js';

let hod, mentor, subject;

beforeEach(async () => {
  await resetDatabase();
  hod = await createHod({ departmentCode: 'CSE' });
  mentor = await createUser({ role: 'MENTOR', departmentCode: 'CSE', maxStudents: 100 });
  subject = await createSubject({ departmentCode: 'CSE', semester: 3 });
});

afterAll(() => prisma.$disconnect());

describe('health and readiness', () => {
  it('checks the database rather than only reporting OK', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database.ok).toBe(true);
    expect(res.body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('uptimeSeconds');
  });

  it('reports readiness including whether migrations are applied', async () => {
    const res = await request(app).get('/api/ready');

    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.checks.migrations.ok).toBe(true);
    expect(res.body.checks.migrations.latest).toBeTruthy();
    expect(res.body.checks.migrations.unfinished).toBe(0);
  });

  it('needs no authentication, so a load balancer can call it', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/api/ready')).status).toBe(200);
  });
});

describe('request ids', () => {
  it('returns one on every response', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('honours one supplied by the caller, so a trace can span services', async () => {
    const res = await request(app).get('/api/health').set('X-Request-Id', 'trace-abc-123');

    expect(res.headers['x-request-id']).toBe('trace-abc-123');
  });

  it('puts the id in the error body, so a user has something to quote', async () => {
    const res = await request(app).get('/api/students/not-a-uuid').set(authHeader(mentor));

    expect(res.status).toBe(400);
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('includes it on a 403 too', async () => {
    const other = await createUser({ role: 'MENTOR', departmentCode: 'CSE' });
    const theirs = await createStudent({ mentorId: other.id });

    const res = await request(app).get(`/api/students/${theirs.student.id}`).set(authHeader(mentor));

    expect(res.status).toBe(403);
    expect(res.body.requestId).toBeTruthy();
  });
});

describe('error reports carry no student data', () => {
  it('redacts names, emails, roll numbers and remarks', () => {
    const safe = scrub({
      name: 'Asha Rao',
      rollNumber: '1AB22CS001',
      email: 'asha@college.edu.in',
      remark: 'Discussed a personal matter',
      semester: 3,
      nested: { phone: '9999999999', count: 2 },
    });

    expect(safe.name).toBe('[redacted]');
    expect(safe.rollNumber).toBe('[redacted]');
    expect(safe.email).toBe('[redacted]');
    expect(safe.remark).toBe('[redacted]');
    expect(safe.nested.phone).toBe('[redacted]');
    // Things that are not personal survive, or the report is useless.
    expect(safe.semester).toBe(3);
    expect(safe.nested.count).toBe(2);
  });

  it('finds an email anywhere in a string', () => {
    expect(scrub('Failed to email asha@college.edu.in about marks'))
      .toBe('Failed to email [redacted] about marks');
  });

  it('reduces the user to an id and strips credentials from the request', () => {
    const event = scrubEvent({
      user: { id: 'user-1', email: 'asha@college.edu.in', username: 'asha' },
      request: {
        url: 'https://amis/api/students?email=asha@college.edu.in',
        headers: { authorization: 'Bearer secret', cookie: 'amis_refresh=secret', 'user-agent': 'Firefox' },
        cookies: { amis_refresh: 'secret' },
        data: { name: 'Asha Rao', semester: 3 },
      },
      exception: { values: [{ value: 'Could not find asha@college.edu.in' }] },
    });

    expect(event.user).toEqual({ id: 'user-1' });
    expect(event.request.cookies).toBeUndefined();
    expect(event.request.headers.authorization).toBeUndefined();
    expect(event.request.headers.cookie).toBeUndefined();
    expect(event.request.headers['user-agent']).toBe('Firefox');
    expect(event.request.url).not.toContain('asha@');
    expect(event.request.data.name).toBe('[redacted]');
    expect(event.exception.values[0].value).not.toContain('asha@');
  });
});

describe('analytics are aggregated in the database', () => {
  const populate = async (count) => {
    const students = [];
    for (let index = 0; index < count; index++) {
      const student = await createStudent({ mentorId: mentor.id, departmentCode: 'CSE', semester: 3 });
      await prisma.score.create({
        data: {
          semesterRecordId: student.semesterRecord.id,
          subjectId: subject.id,
          test1: 20, test2: 20, assignment: 20,
          internalTotal: 40,
          exam: 10 + index * 5,
          finalScore: 50 + index * 5,
        },
      });
      students.push(student);
    }
    return students;
  };

  it('returns the top performers in order, limited by the database', async () => {
    await populate(5);

    const rows = await topPerformers(hod, { limit: 3 });

    expect(rows).toHaveLength(3);
    expect(rows[0].averageScore).toBeGreaterThan(rows[1].averageScore);
    expect(rows[0]).toHaveProperty('mentorName');
    expect(rows[0].totalSubjects).toBe(1);
  });

  it('counts pass and fail without loading the scores', async () => {
    await populate(3);

    const counts = await passFailCounts(hod);

    expect(counts.pass + counts.fail).toBe(3);
    expect(counts.pass).toBe(3);
  });

  it('keeps every aggregate inside the caller\'s scope', async () => {
    await populate(2);

    const otherHod = await createHod({ departmentCode: 'ECE' });

    expect(await topPerformers(otherHod, { limit: 10 })).toHaveLength(0);
    expect((await passFailCounts(otherHod)).pass).toBe(0);
    expect(await atRiskStudents(otherHod)).toHaveLength(0);

    expect((await topPerformers(hod, { limit: 10 })).length).toBe(2);
  });

  it('lists students carrying a high alert, worst first', async () => {
    const students = await populate(2);

    await prisma.alert.createMany({
      data: [
        { semesterRecordId: students[0].semesterRecord.id, type: 'AT_RISK', severity: 'HIGH', message: 'one' },
        { semesterRecordId: students[1].semesterRecord.id, type: 'AT_RISK', severity: 'HIGH', message: 'two' },
        { semesterRecordId: students[1].semesterRecord.id, type: 'WEAK', severity: 'HIGH', message: 'three' },
        { semesterRecordId: students[1].semesterRecord.id, type: 'LOW_ENGAGEMENT', severity: 'LOW', message: 'four' },
      ],
    });

    const rows = await atRiskStudents(hod);

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(students[1].student.id);
    expect(rows[0].highAlerts).toBe(2);
    expect(rows[0].openAlerts).toBe(3);
  });

  it('finds mentees nobody has logged an interaction with', async () => {
    const students = await populate(2);

    await prisma.progressLog.create({
      data: {
        semesterRecordId: students[0].semesterRecord.id,
        mentorId: mentor.id,
        remark: 'Spoke yesterday',
        date: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    const rows = await quietStudents(hod, { days: 30 });

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(students[1].student.id);
    expect(rows[0].lastInteraction).toBeNull();
  });

  it('shows a super admin every department', async () => {
    await populate(1);
    const superAdmin = await createSuperAdmin();

    expect((await topPerformers(superAdmin, { limit: 10 })).length).toBe(1);
  });
});
