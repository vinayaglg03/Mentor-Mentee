import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import {
  prisma, resetDatabase, createUser, createStudent, createSubject, createDepartment, authHeader,
} from './helpers.js';

let mentor, other;

beforeEach(async () => {
  await resetDatabase();
  await createDepartment({ code: 'CSE' });
  mentor = await createUser({ role: 'MENTOR', departmentCode: 'CSE', maxStudents: 100 });
  other = await createUser({ role: 'MENTOR', departmentCode: 'CSE', maxStudents: 100 });
});

afterAll(() => prisma.$disconnect());

describe('the summary view of the mentee list', () => {
  it('carries what the list draws and leaves out what it does not', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const subject = await createSubject({ departmentCode: 'CSE', semester: 3 });

    await request(app).post('/api/attendance/bulk').set(authHeader(mentor)).send({
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: student.student.id, classesHeld: 100, classesAttended: 60 }],
    });

    const full = await request(app).get('/api/mentors/students').set(authHeader(mentor));
    const summary = await request(app)
      .get('/api/mentors/students')
      .query({ view: 'summary' })
      .set(authHeader(mentor));

    expect(summary.status).toBe(200);

    const [row] = summary.body;
    expect(row).toMatchObject({
      rollNumber: student.student.rollNumber,
      name: student.student.name,
    });

    // What the six columns need.
    expect(row.semesterRecords[0]).toMatchObject({ semester: 3, attendancePercent: 60 });
    expect(row.semesterRecords[0].alertCount).toBeGreaterThan(0);

    // ...and not the parts that made it large: every earlier semester, every
    // alert in full, and every mentoring remark with the name of its author.
    expect(row.semesterRecords).toHaveLength(1);
    expect(row.semesterRecords[0].alerts).toBeUndefined();
    expect(row.semesterRecords[0].progressLogs).toBeUndefined();

    expect(JSON.stringify(summary.body).length)
      .toBeLessThan(JSON.stringify(full.body).length);
  });

  it('still shows only the signed-in mentor their own mentees', async () => {
    await createStudent({ mentorId: other.id });

    const summary = await request(app)
      .get('/api/mentors/students')
      .query({ view: 'summary' })
      .set(authHeader(mentor));

    expect(summary.body).toHaveLength(0);
  });

  it('leaves the default shape alone for callers that depend on it', async () => {
    await createStudent({ mentorId: mentor.id, semester: 3 });

    const full = await request(app).get('/api/mentors/students').set(authHeader(mentor));

    expect(full.body[0].semesterRecords[0]).toHaveProperty('alerts');
    expect(full.body[0].semesterRecords[0]).toHaveProperty('progressLogs');
  });

  it('reports no attendance rather than zero when none has been recorded', async () => {
    await createStudent({ mentorId: mentor.id, semester: 3 });

    const summary = await request(app)
      .get('/api/mentors/students')
      .query({ view: 'summary' })
      .set(authHeader(mentor));

    // 0% and "nothing recorded yet" are different things, and the dashboard
    // colours one of them red.
    expect(summary.body[0].semesterRecords[0].attendancePercent).toBeNull();
  });
});
