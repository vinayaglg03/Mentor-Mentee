import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import {
  prisma, resetDatabase, createUser, createStudent, createBatch, createDepartment,
  createHod, createSuperAdmin, authHeader,
} from './helpers.js';

let hod, mentor, batch;

const studentIn = (batchRow, overrides = {}) =>
  createStudent({
    mentorId: mentor.id,
    departmentCode: 'CSE',
    admissionYear: batchRow.admissionYear,
    semester: batchRow.currentSemester,
    ...overrides,
  });

beforeEach(async () => {
  await resetDatabase();
  await createDepartment({ code: 'CSE' });
  hod = await createHod({ departmentCode: 'CSE' });
  mentor = await createUser({ role: 'MENTOR', departmentCode: 'CSE', maxStudents: 100 });
  batch = await createBatch({ departmentCode: 'CSE', admissionYear: 2024, currentSemester: 3 });
});

afterAll(() => prisma.$disconnect());

const preview = (user, id = batch.id) =>
  request(app).post(`/api/admin/batches/${id}/promote/preview`).set(authHeader(user));

const promote = (user, body = {}, id = batch.id) =>
  request(app).post(`/api/admin/batches/${id}/promote`).set(authHeader(user)).send(body);

describe('preview', () => {
  it('says exactly what will change before anything does', async () => {
    const a = await studentIn(batch);
    const b = await studentIn(batch);

    const res = await preview(hod);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fromSemester: 3, toSemester: 4 });
    expect(res.body.summary).toMatchObject({ total: 2, promote: 2, graduate: 0, skip: 0 });
    expect(res.body.promote.map(s => s.id).sort()).toEqual([a.student.id, b.student.id].sort());

    // Nothing has moved.
    const after = await prisma.student.findMany({ where: { batchId: batch.id } });
    expect(after.every(s => s.currentSemester === 3)).toBe(true);
  });

  it('lists who is skipped and why', async () => {
    await studentIn(batch);
    const dropped = await studentIn(batch, { status: 'DROPPED' });
    const detained = await studentIn(batch, { semester: 2 });
    const ahead = await studentIn(batch, { semester: 4 });

    const res = await preview(hod);

    expect(res.body.summary).toMatchObject({ promote: 1, skip: 3 });

    const reasons = Object.fromEntries(res.body.skip.map(s => [s.id, s.reason]));
    expect(reasons[dropped.student.id]).toMatch(/dropped/i);
    expect(reasons[detained.student.id]).toMatch(/Detained in semester 2/);
    expect(reasons[ahead.student.id]).toMatch(/Already in semester 4/);
  });

  it('marks the final semester as graduation rather than promotion', async () => {
    const finalBatch = await createBatch({ departmentCode: 'CSE', admissionYear: 2021, currentSemester: 8 });
    await studentIn(finalBatch);

    const res = await preview(hod, finalBatch.id);

    expect(res.body.isFinal).toBe(true);
    expect(res.body.summary).toMatchObject({ promote: 0, graduate: 1 });
  });
});

describe('promotion', () => {
  it('moves the batch and its students on one semester', async () => {
    const student = await studentIn(batch);

    const res = await promote(hod, { fromSemester: 3 });

    expect(res.status).toBe(200);
    expect(res.body.rollover).toMatchObject({ fromSemester: 3, toSemester: 4, promoted: 1 });

    const after = await prisma.student.findUnique({ where: { id: student.student.id } });
    expect(after.currentSemester).toBe(4);
    expect(after.currentYear).toBe(2);
    // 3 -> 4 stays in the same academic year.
    expect(after.currentAcademicYear).toBe(2026);
    // The mentor comes with them.
    expect(after.mentorId).toBe(mentor.id);

    const batchAfter = await prisma.batch.findUnique({ where: { id: batch.id } });
    expect(batchAfter.currentSemester).toBe(4);
  });

  it('creates the semester record the new marks will hang off', async () => {
    const student = await studentIn(batch);

    await promote(hod, { fromSemester: 3 });

    const records = await prisma.semesterRecord.findMany({
      where: { studentId: student.student.id },
      orderBy: { semester: 'asc' },
    });

    expect(records.map(r => r.semester)).toEqual([3, 4]);
  });

  it('rolls the academic year when moving into an odd semester', async () => {
    const evenBatch = await createBatch({ departmentCode: 'CSE', admissionYear: 2023, currentSemester: 4 });
    const student = await studentIn(evenBatch);

    await promote(hod, { fromSemester: 4 }, evenBatch.id);

    const after = await prisma.student.findUnique({ where: { id: student.student.id } });
    expect(after.currentSemester).toBe(5);
    expect(after.currentAcademicYear).toBe(2027);
  });

  it('graduates a final-year batch instead of inventing a ninth semester', async () => {
    const finalBatch = await createBatch({ departmentCode: 'CSE', admissionYear: 2021, currentSemester: 8 });
    const student = await studentIn(finalBatch);

    const res = await promote(hod, { fromSemester: 8 }, finalBatch.id);

    expect(res.status).toBe(200);
    expect(res.body.rollover.graduated).toBe(1);

    const after = await prisma.student.findUnique({ where: { id: student.student.id } });
    expect(after.status).toBe('GRADUATED');
    expect(after.currentSemester).toBe(8);

    // The batch does not move past its final semester.
    const batchAfter = await prisma.batch.findUnique({ where: { id: finalBatch.id } });
    expect(batchAfter.currentSemester).toBe(8);
  });

  it('leaves detained, dropped and transferred students where they are', async () => {
    const detained = await studentIn(batch, { semester: 2 });
    const dropped = await studentIn(batch, { status: 'DROPPED' });
    await studentIn(batch);

    const res = await promote(hod, { fromSemester: 3 });

    expect(res.body.rollover).toMatchObject({ promoted: 1, skipped: 2 });
    expect(res.body.skipped).toHaveLength(2);

    expect((await prisma.student.findUnique({ where: { id: detained.student.id } })).currentSemester).toBe(2);
    expect((await prisma.student.findUnique({ where: { id: dropped.student.id } })).currentSemester).toBe(3);
  });

  it('is safe to run twice: the second run is refused, not applied', async () => {
    const student = await studentIn(batch);

    const first = await promote(hod, { fromSemester: 3 });
    expect(first.status).toBe(200);

    const second = await promote(hod, { fromSemester: 3 });
    expect(second.status).toBe(409);

    const after = await prisma.student.findUnique({ where: { id: student.student.id } });
    expect(after.currentSemester).toBe(4);
    expect(await prisma.semesterRollover.count()).toBe(1);
  });

  it('refuses a batch with nobody left to promote', async () => {
    await studentIn(batch, { status: 'DROPPED' });

    const res = await promote(hod, { fromSemester: 3 });

    expect(res.status).toBe(400);
    expect(await prisma.semesterRollover.count()).toBe(0);
  });

  it('records who ran it and what it did', async () => {
    await studentIn(batch);
    await studentIn(batch, { semester: 2 });

    await promote(hod, { fromSemester: 3 });

    const [rollover] = await prisma.semesterRollover.findMany({ include: { actor: true } });

    expect(rollover.actor.id).toBe(hod.id);
    expect(rollover).toMatchObject({ fromSemester: 3, toSemester: 4, promoted: 1, skipped: 1 });
    expect(rollover.details.skipped[0].reason).toMatch(/Detained/);
    expect(rollover.createdAt).toBeInstanceOf(Date);
  });

  it('recomputes CGPA as part of the run', async () => {
    const student = await studentIn(batch);
    const subject = await prisma.subject.create({
      data: {
        name: 'Data Structures', code: 'CS301X', department: 'CSE',
        departmentId: (await prisma.department.findUnique({ where: { code: 'CSE' } })).id,
        academicYear: 2026, semester: 3, credits: 4,
      },
    });
    await prisma.gradeBand.createMany({
      data: [
        { label: 'A', minScore: 80, gradePoint: 9 },
        { label: 'F', minScore: 0, gradePoint: 0 },
      ],
    });

    const record = await prisma.semesterRecord.findFirst({ where: { studentId: student.student.id } });
    await prisma.score.create({
      data: {
        semesterRecordId: record.id, subjectId: subject.id,
        test1: 20, test2: 20, assignment: 20, internalTotal: 40, exam: 40, finalScore: 80,
      },
    });

    await promote(hod, { fromSemester: 3 });

    const after = await prisma.semesterRecord.findUnique({ where: { id: record.id } });
    expect(after.sgpa).toBe(9);
    expect(after.cgpa).toBe(9);
  });
});

describe('who may promote', () => {
  it('refuses a mentor', async () => {
    await studentIn(batch);

    expect((await preview(mentor)).status).toBe(403);
    expect((await promote(mentor, { fromSemester: 3 })).status).toBe(403);
    expect(await prisma.semesterRollover.count()).toBe(0);
  });

  it('refuses a HOD from another department', async () => {
    await createDepartment({ code: 'ECE' });
    const eceHod = await createHod({ departmentCode: 'ECE' });
    await studentIn(batch);

    expect((await preview(eceHod)).status).toBe(403);
    expect((await promote(eceHod, { fromSemester: 3 })).status).toBe(403);
  });

  it('lets a super admin promote any batch', async () => {
    const superAdmin = await createSuperAdmin();
    await studentIn(batch);

    expect((await promote(superAdmin, { fromSemester: 3 })).status).toBe(200);
  });

  it('lists past runs for the batch', async () => {
    await studentIn(batch);
    await promote(hod, { fromSemester: 3 });

    const res = await request(app).get(`/api/admin/batches/${batch.id}/rollovers`).set(authHeader(hod));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].actor.email).toBe(hod.email);
  });
});
