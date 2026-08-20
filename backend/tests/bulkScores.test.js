import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma, resetDatabase, createUser, createStudent, createSubject, authHeader } from './helpers.js';

let mentor, other, admin, subject;

beforeEach(async () => {
  await resetDatabase();
  mentor = await createUser({ role: 'MENTOR', maxStudents: 100 });
  other = await createUser({ role: 'MENTOR' });
  admin = await createUser({ role: 'ADMIN' });
  subject = await createSubject({ semester: 3 });
});

afterAll(() => prisma.$disconnect());

const classFor = (user, params) =>
  request(app).get('/api/scores/class').set(authHeader(user)).query(params);

const bulk = (user, body) =>
  request(app).post('/api/scores/bulk').set(authHeader(user)).send(body);

describe('GET /api/scores/class', () => {
  it('lists a mentor\'s students for one subject with their existing marks', async () => {
    const mine = await createStudent({ mentorId: mentor.id, semester: 3 });
    await createStudent({ mentorId: other.id, semester: 3 });

    await bulk(mentor, {
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: mine.student.id, test1: 20, test2: 20, assignment: 20, exam: 40 }],
    });

    const res = await classFor(mentor, { department: 'CSE', semester: 3, academicYear: 2026, subjectId: subject.id });

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({
      studentId: mine.student.id,
      test1: 20,
      exam: 40,
      finalScore: 80,
    });
  });

  it('shows an admin every student in the class', async () => {
    await createStudent({ mentorId: mentor.id, semester: 3 });
    await createStudent({ mentorId: other.id, semester: 3 });

    const res = await classFor(admin, { department: 'CSE', semester: 3, academicYear: 2026, subjectId: subject.id });

    expect(res.body.rows).toHaveLength(2);
  });

  it('leaves cells blank when no marks exist yet', async () => {
    await createStudent({ mentorId: mentor.id, semester: 3 });

    const res = await classFor(mentor, { department: 'CSE', semester: 3, academicYear: 2026, subjectId: subject.id });

    expect(res.body.rows[0]).toMatchObject({ test1: '', test2: '', assignment: '', exam: '', finalScore: null });
  });
});

describe('POST /api/scores/bulk', () => {
  it('saves a whole class in one call', async () => {
    const students = [];
    for (let i = 0; i < 5; i++) {
      students.push(await createStudent({ mentorId: mentor.id, semester: 3 }));
    }

    const res = await bulk(mentor, {
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: students.map(s => ({ studentId: s.student.id, test1: 20, test2: 22, assignment: 25, exam: 45 })),
    });

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(5);
    expect(await prisma.score.count()).toBe(5);
    // ((20 + 22) / 2) + 25 = 46, + 45 external = 91
    expect(res.body.results.every(r => r.finalScore === 91)).toBe(true);
  });

  it('saves nothing when one row is out of range', async () => {
    const a = await createStudent({ mentorId: mentor.id, semester: 3 });
    const b = await createStudent({ mentorId: mentor.id, semester: 3 });

    const res = await bulk(mentor, {
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [
        { studentId: a.student.id, test1: 20, test2: 20, assignment: 20, exam: 40 },
        { studentId: b.student.id, test1: 40, test2: 20, assignment: 20, exam: 40 },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ studentId: b.student.id, index: 1 });
    expect(await prisma.score.count()).toBe(0);
  });

  it("refuses a batch containing another mentor's student", async () => {
    const mine = await createStudent({ mentorId: mentor.id, semester: 3 });
    const theirs = await createStudent({ mentorId: other.id, semester: 3 });

    const res = await bulk(mentor, {
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [
        { studentId: mine.student.id, test1: 20, test2: 20, assignment: 20, exam: 40 },
        { studentId: theirs.student.id, test1: 20, test2: 20, assignment: 20, exam: 40 },
      ],
    });

    expect(res.status).toBe(403);
    expect(await prisma.score.count()).toBe(0);
  });

  it('raises the same alerts as single entry', async () => {
    const viaBulk = await createStudent({ mentorId: mentor.id, semester: 3 });
    const viaForm = await createStudent({ mentorId: mentor.id, semester: 3 });
    const marks = { test1: 8, test2: 20, assignment: 4, exam: 15 };

    await bulk(mentor, {
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: viaBulk.student.id, ...marks }],
    });

    await request(app).post('/api/scores').set(authHeader(mentor)).send({
      studentId: viaForm.student.id,
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      ...marks,
    });

    const alertsFor = (studentId) => prisma.alert.findMany({
      where: { semesterRecord: { studentId } },
      select: { type: true, severity: true, message: true },
      orderBy: { type: 'asc' },
    });

    const bulkAlerts = await alertsFor(viaBulk.student.id);
    expect(bulkAlerts.length).toBeGreaterThan(0);
    expect(bulkAlerts).toEqual(await alertsFor(viaForm.student.id));
  });

  it('overwrites a previous save rather than duplicating scores', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const body = (exam) => ({
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: student.student.id, test1: 20, test2: 20, assignment: 20, exam }],
    });

    await bulk(mentor, body(30));
    await bulk(mentor, body(45));

    const scores = await prisma.score.findMany({ where: { semesterRecord: { studentId: student.student.id } } });
    expect(scores).toHaveLength(1);
    expect(scores[0].exam).toBe(45);
  });

  it('creates the semester record when a student has none for that year', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });

    const res = await bulk(mentor, {
      subjectId: subject.id,
      semester: 5,
      academicYear: 2027,
      rows: [{ studentId: student.student.id, test1: 20, test2: 20, assignment: 20, exam: 40 }],
    });

    expect(res.status).toBe(200);
    const records = await prisma.semesterRecord.findMany({ where: { studentId: student.student.id } });
    expect(records.map(r => r.semester).sort()).toEqual([3, 5]);
  });

  it('rejects an empty batch', async () => {
    const res = await bulk(mentor, { subjectId: subject.id, semester: 3, academicYear: 2026, rows: [] });
    expect(res.status).toBe(400);
  });
});
