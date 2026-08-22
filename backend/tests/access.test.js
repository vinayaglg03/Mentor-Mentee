import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma, resetDatabase, createUser, createStudent, createSubject, createAlert, authHeader, createHod } from './helpers.js';

let mentorA, mentorB, admin, foreign, subject;

beforeEach(async () => {
  await resetDatabase();
  mentorA = await createUser({ role: 'MENTOR' });
  mentorB = await createUser({ role: 'MENTOR' });
  admin = await createHod();
  foreign = await createStudent({ mentorId: mentorB.id });
  subject = await createSubject({ semester: 3 });
});

afterAll(() => prisma.$disconnect());

// Every route in the Task 4 table, exercised against a student belonging to
// another mentor.
const foreignRequests = [
  ['GET /api/students/:id', () => request(app).get(`/api/students/${foreign.student.id}`)],
  ['PUT /api/students/:id', () => request(app).put(`/api/students/${foreign.student.id}`).send({ name: 'Renamed' })],
  ['GET /api/scores/:studentId', () => request(app).get(`/api/scores/${foreign.student.id}`)],
  ['POST /api/scores', () => request(app).post('/api/scores').send({
    studentId: foreign.student.id, subjectId: subject.id, test1: 20, test2: 20, assignment: 20, exam: 40, academicYear: 2026, semester: 3,
  })],
  ['GET /api/alerts/student/:studentId', () => request(app).get(`/api/alerts/student/${foreign.student.id}`)],
  ['GET /api/mentors/logs/:studentId', () => request(app).get(`/api/mentors/logs/${foreign.student.id}`)],
  ['POST /api/mentors/logs', () => request(app).post('/api/mentors/logs').send({
    studentId: foreign.student.id, semesterRecordId: foreign.semesterRecord.id, remark: 'nosey',
  })],
  ['POST /api/mentors/achievements', () => request(app).post('/api/mentors/achievements').send({
    studentId: foreign.student.id, semesterRecordId: foreign.semesterRecord.id, title: 'nosey',
  })],
];

describe("a mentor touching another mentor's student", () => {
  it.each(foreignRequests)('%s returns 403', async (_name, call) => {
    const res = await call().set(authHeader(mentorA));
    expect(res.status).toBe(403);
  });

  it('PUT /api/alerts/:id/resolve returns 403', async () => {
    const alert = await createAlert(foreign.semesterRecord.id);
    const res = await request(app).put(`/api/alerts/${alert.id}/resolve`).set(authHeader(mentorA));
    expect(res.status).toBe(403);

    const unchanged = await prisma.alert.findUnique({ where: { id: alert.id } });
    expect(unchanged.resolved).toBe(false);
  });

  it('GET /api/students only lists the caller\'s own mentees', async () => {
    const own = await createStudent({ mentorId: mentorA.id });

    const res = await request(app).get('/api/students').set(authHeader(mentorA));

    expect(res.status).toBe(200);
    expect(res.body.map(s => s.id)).toEqual([own.student.id]);
  });

  it('GET /api/students returns every active student for an admin', async () => {
    await createStudent({ mentorId: mentorA.id });

    const res = await request(app).get('/api/students').set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('a mentor working on their own student', () => {
  let own;

  beforeEach(async () => {
    own = await createStudent({ mentorId: mentorA.id, semester: 3 });
  });

  it('reads the student', async () => {
    const res = await request(app).get(`/api/students/${own.student.id}`).set(authHeader(mentorA));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(own.student.id);
  });

  it('updates the student', async () => {
    const res = await request(app)
      .put(`/api/students/${own.student.id}`)
      .set(authHeader(mentorA))
      .send({ name: 'Renamed' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
  });

  it('reads and writes scores', async () => {
    const post = await request(app).post('/api/scores').set(authHeader(mentorA)).send({
      studentId: own.student.id, subjectId: subject.id, test1: 20, test2: 20, assignment: 20, exam: 40, academicYear: 2026, semester: 3,
    });
    expect(post.status).toBe(200);

    const get = await request(app).get(`/api/scores/${own.student.id}`).set(authHeader(mentorA));
    expect(get.status).toBe(200);
    expect(get.body).toHaveLength(1);
  });

  it('reads alerts and resolves them', async () => {
    const alert = await createAlert(own.semesterRecord.id);

    const list = await request(app).get(`/api/alerts/student/${own.student.id}`).set(authHeader(mentorA));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const resolve = await request(app).put(`/api/alerts/${alert.id}/resolve`).set(authHeader(mentorA));
    expect(resolve.status).toBe(200);
    expect(resolve.body.resolved).toBe(true);
  });

  it('writes progress logs and achievements and reads them back', async () => {
    const log = await request(app).post('/api/mentors/logs').set(authHeader(mentorA)).send({
      studentId: own.student.id, semesterRecordId: own.semesterRecord.id, remark: 'Doing well',
    });
    expect(log.status).toBe(201);

    const achievement = await request(app).post('/api/mentors/achievements').set(authHeader(mentorA)).send({
      studentId: own.student.id, semesterRecordId: own.semesterRecord.id, title: 'Hackathon winner',
    });
    expect(achievement.status).toBe(201);

    const logs = await request(app).get(`/api/mentors/logs/${own.student.id}`).set(authHeader(mentorA));
    expect(logs.status).toBe(200);
    expect(logs.body).toHaveLength(1);
  });
});

describe('an admin', () => {
  it("can read any mentor's student", async () => {
    const res = await request(app).get(`/api/students/${foreign.student.id}`).set(authHeader(admin));
    expect(res.status).toBe(200);
  });
});

describe('soft delete', () => {
  it('keeps the academic record and hides the student from listings', async () => {
    const own = await createStudent({ mentorId: mentorA.id });

    const res = await request(app).delete(`/api/students/${own.student.id}`).set(authHeader(admin));
    expect(res.status).toBe(200);

    const student = await prisma.student.findUnique({ where: { id: own.student.id } });
    expect(student.status).toBe('DROPPED');

    const records = await prisma.semesterRecord.count({ where: { studentId: own.student.id } });
    expect(records).toBe(1);

    const list = await request(app).get('/api/students').set(authHeader(mentorA));
    expect(list.body).toHaveLength(0);
  });
});
