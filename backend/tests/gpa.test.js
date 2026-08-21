import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma, resetDatabase, createUser, createStudent, createSubject, authHeader } from './helpers.js';
import { gradeFor, weightedAverage, DEFAULT_BANDS } from '../src/lib/gpa.js';
import { backfillGpa } from '../src/jobs/backfillGpa.js';

let mentor, admin;

const seedGradeBands = () =>
  prisma.gradeBand.createMany({ data: DEFAULT_BANDS });

const subjectWithCredits = (credits, semester = 3) =>
  createSubject({ credits, semester });

beforeEach(async () => {
  await resetDatabase();
  await seedGradeBands();
  mentor = await createUser({ role: 'MENTOR', maxStudents: 100 });
  admin = await createUser({ role: 'ADMIN' });
});

afterAll(() => prisma.$disconnect());

const postScore = (user, body) =>
  request(app).post('/api/scores').set(authHeader(user)).send(body);

describe('grade mapping', () => {
  it('picks the highest band the score reaches', () => {
    expect(gradeFor(95, DEFAULT_BANDS).gradePoint).toBe(10);
    expect(gradeFor(90, DEFAULT_BANDS).gradePoint).toBe(10);
    expect(gradeFor(89.9, DEFAULT_BANDS).gradePoint).toBe(9);
    expect(gradeFor(40, DEFAULT_BANDS).gradePoint).toBe(5);
    expect(gradeFor(39, DEFAULT_BANDS).gradePoint).toBe(0);
  });

  it('weights by credits, counting failed subjects at zero', () => {
    // 4 credits at 10 points and 2 credits at 0 = 40 / 6
    expect(weightedAverage([
      { credits: 4, gradePoint: 10 },
      { credits: 2, gradePoint: 0 },
    ])).toBe(6.67);
  });

  it('returns null when no credits have been attempted', () => {
    expect(weightedAverage([])).toBeNull();
  });
});

describe('SGPA and CGPA', () => {
  it('computes SGPA when a score is saved', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const four = await subjectWithCredits(4);
    const two = await subjectWithCredits(2);

    // 92 -> S (10), 45 -> E (5)
    await postScore(mentor, { studentId: student.student.id, subjectId: four.id, semester: 3, academicYear: 2026, test1: 22, test2: 22, assignment: 25, exam: 45 });
    await postScore(mentor, { studentId: student.student.id, subjectId: two.id, semester: 3, academicYear: 2026, test1: 10, test2: 10, assignment: 10, exam: 25 });

    const record = await prisma.semesterRecord.findFirst({ where: { studentId: student.student.id } });
    // (4 * 10 + 2 * 5) / 6
    expect(record.sgpa).toBe(8.33);
    expect(record.cgpa).toBe(8.33);
  });

  it('carries CGPA cumulatively across semesters', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const third = await subjectWithCredits(4, 3);
    const fourth = await subjectWithCredits(4, 4);

    await postScore(mentor, { studentId: student.student.id, subjectId: third.id, semester: 3, academicYear: 2026, test1: 25, test2: 25, assignment: 25, exam: 50 });
    await postScore(mentor, { studentId: student.student.id, subjectId: fourth.id, semester: 4, academicYear: 2026, test1: 15, test2: 15, assignment: 15, exam: 30 });

    const records = await prisma.semesterRecord.findMany({
      where: { studentId: student.student.id },
      orderBy: { semester: 'asc' },
    });

    // Semester 3: internal 50 + exam 50 = 100 -> S (10).
    // Semester 4: internal (15 + 15) / 2 + 15 = 30, + 30 = 60 -> C (7).
    expect(records[0].sgpa).toBe(10);
    expect(records[0].cgpa).toBe(10);
    expect(records[1].sgpa).toBe(7);
    // Cumulative across 4 + 4 credits: (4 * 10 + 4 * 7) / 8
    expect(records[1].cgpa).toBe(8.5);
  });

  it('recomputes when a mark is corrected', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const subject = await subjectWithCredits(4);

    await postScore(mentor, { studentId: student.student.id, subjectId: subject.id, semester: 3, academicYear: 2026, test1: 25, test2: 25, assignment: 25, exam: 50 });
    let record = await prisma.semesterRecord.findFirst({ where: { studentId: student.student.id } });
    expect(record.sgpa).toBe(10);

    await postScore(mentor, { studentId: student.student.id, subjectId: subject.id, semester: 3, academicYear: 2026, test1: 10, test2: 10, assignment: 10, exam: 20 });
    record = await prisma.semesterRecord.findFirst({ where: { studentId: student.student.id } });
    // internal (10 + 10) / 2 + 10 = 20, + 20 = 40 -> E (5)
    expect(record.sgpa).toBe(5);
  });

  it('computes GPA for a bulk save', async () => {
    const a = await createStudent({ mentorId: mentor.id, semester: 3 });
    const b = await createStudent({ mentorId: mentor.id, semester: 3 });
    const subject = await subjectWithCredits(3);

    await request(app).post('/api/scores/bulk').set(authHeader(mentor)).send({
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [
        { studentId: a.student.id, test1: 25, test2: 25, assignment: 25, exam: 50 },
        { studentId: b.student.id, test1: 12, test2: 12, assignment: 12, exam: 25 },
      ],
    });

    const records = await prisma.semesterRecord.findMany({ orderBy: { sgpa: 'desc' } });
    expect(records[0].sgpa).toBe(10);
    // internal (12 + 12) / 2 + 12 = 24, + 25 = 49 -> E (5)
    expect(records[1].sgpa).toBe(5);
  });

  it('leaves SGPA null while no external marks are in', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const subject = await subjectWithCredits(4);

    await postScore(mentor, { studentId: student.student.id, subjectId: subject.id, semester: 3, academicYear: 2026, test1: 20, test2: 20, assignment: 20 });

    const record = await prisma.semesterRecord.findFirst({ where: { studentId: student.student.id } });
    expect(record.sgpa).toBeNull();
  });
});

describe('grade scale administration', () => {
  it('returns the seeded scale to an admin', async () => {
    const res = await request(app).get('/api/admin/grade-scale').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.bands).toHaveLength(7);
    expect(res.body.bands[0]).toMatchObject({ label: 'S', gradePoint: 10 });
  });

  it('refuses a mentor', async () => {
    const res = await request(app).get('/api/admin/grade-scale').set(authHeader(mentor));
    expect(res.status).toBe(403);
  });

  it('replaces the scale and changes what the backfill computes', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const subject = await subjectWithCredits(4);

    // 80 -> A (9) on the default scale.
    await postScore(mentor, { studentId: student.student.id, subjectId: subject.id, semester: 3, academicYear: 2026, test1: 20, test2: 20, assignment: 20, exam: 40 });
    let record = await prisma.semesterRecord.findFirst({ where: { studentId: student.student.id } });
    expect(record.sgpa).toBe(9);

    // A four-point scale where 80 is worth 4.
    const res = await request(app).put('/api/admin/grade-scale').set(authHeader(admin)).send({
      bands: [
        { label: 'A', minScore: 75, gradePoint: 4 },
        { label: 'B', minScore: 50, gradePoint: 3 },
        { label: 'F', minScore: 0, gradePoint: 0 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.bands).toHaveLength(3);

    await backfillGpa();

    record = await prisma.semesterRecord.findFirst({ where: { studentId: student.student.id } });
    expect(record.sgpa).toBe(4);
  });

  it('rejects a scale with no band starting at zero', async () => {
    const res = await request(app).put('/api/admin/grade-scale').set(authHeader(admin)).send({
      bands: [{ label: 'A', minScore: 40, gradePoint: 4 }],
    });

    expect(res.status).toBe(400);
    expect(await prisma.gradeBand.count()).toBe(7);
  });
});

describe('backfill job', () => {
  it('fills in GPA for records written before the feature existed', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const subject = await subjectWithCredits(4);
    const record = await prisma.semesterRecord.findFirst({ where: { studentId: student.student.id } });

    // Write a score straight to the database, as older data would look.
    await prisma.score.create({
      data: {
        semesterRecordId: record.id,
        subjectId: subject.id,
        test1: 20, test2: 20, assignment: 20,
        internalTotal: 40, exam: 40, finalScore: 80,
      },
    });

    expect((await prisma.semesterRecord.findUnique({ where: { id: record.id } })).sgpa).toBeNull();

    const result = await backfillGpa();
    expect(result.students).toBe(1);

    expect((await prisma.semesterRecord.findUnique({ where: { id: record.id } })).sgpa).toBe(9);
  });
});
