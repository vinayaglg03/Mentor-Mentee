import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma, resetDatabase, createUser, createStudent, createSubject, authHeader } from './helpers.js';

let mentor;

beforeEach(async () => {
  await resetDatabase();
  mentor = await createUser({ role: 'MENTOR' });
});

afterAll(() => prisma.$disconnect());

const submit = async (student, subject, body) =>
  request(app)
    .post('/api/scores')
    .set(authHeader(mentor))
    .send({ studentId: student.student.id, subjectId: subject.id, academicYear: 2026, ...body });

describe('internal total calculation', () => {
  it('semesters 1-2 average the two tests out of 50', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 1 });
    const subject = await createSubject({ semester: 1 });

    const res = await submit(student, subject, { semester: 1, test1: 45, test2: 35, assignment: 0, exam: 40 });

    expect(res.status).toBe(200);
    expect(res.body.internalTotal).toBe(40);
    expect(res.body.finalScore).toBe(80);
  });

  it('semesters 3+ add the assignment to the test average', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const subject = await createSubject({ semester: 3 });

    const res = await submit(student, subject, { semester: 3, test1: 20, test2: 24, assignment: 25, exam: 30 });

    expect(res.status).toBe(200);
    expect(res.body.internalTotal).toBe(47);
    expect(res.body.finalScore).toBe(77);
  });
});

describe('out-of-range marks', () => {
  it('rejects a test above 50 in semester 1', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 1 });
    const subject = await createSubject({ semester: 1 });

    const res = await submit(student, subject, { semester: 1, test1: 55, test2: 30, assignment: 0, exam: 40 });

    expect(res.status).toBe(400);
  });

  it('rejects a test above 25 in semester 3', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const subject = await createSubject({ semester: 3 });

    const res = await submit(student, subject, { semester: 3, test1: 30, test2: 20, assignment: 10, exam: 40 });

    expect(res.status).toBe(400);
  });

  it('rejects an assignment above 25 in semester 3', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const subject = await createSubject({ semester: 3 });

    const res = await submit(student, subject, { semester: 3, test1: 20, test2: 20, assignment: 30, exam: 40 });

    expect(res.status).toBe(400);
  });

  it('rejects an external exam above 50', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const subject = await createSubject({ semester: 3 });

    const res = await submit(student, subject, { semester: 3, test1: 20, test2: 20, assignment: 20, exam: 60 });

    expect(res.status).toBe(400);
  });

  it('rejects a negative mark before it reaches the controller', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const subject = await createSubject({ semester: 3 });

    const res = await submit(student, subject, { semester: 3, test1: -5, test2: 20, assignment: 20, exam: 40 });

    expect(res.status).toBe(400);
    expect(res.body.details.map(d => d.field)).toContain('test1');
  });
});

describe('generated alerts', () => {
  it('names the real semester instead of "undefined"', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 4 });
    const subject = await createSubject({ semester: 4 });

    await submit(student, subject, { semester: 4, test1: 5, test2: 6, assignment: 2, exam: 10 });

    const alerts = await prisma.alert.findMany({
      where: { semesterRecord: { studentId: student.student.id } },
    });

    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some(a => a.message.includes('undefined'))).toBe(false);
    expect(alerts.some(a => a.message.includes('semester 4'))).toBe(true);
  });
});
