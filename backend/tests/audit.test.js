import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import app from '../src/app.js';
import { unauditedPrisma } from '../src/prismaClient.js';
import { redact, changedFields } from '../src/lib/audit.js';
import { pruneAudit } from '../src/jobs/pruneAudit.js';
import {
  prisma, resetDatabase, createUser, createStudent, createSubject, createDepartment,
  createHod, createSuperAdmin, authHeader,
} from './helpers.js';

let hod, mentor, superAdmin, subject;

beforeEach(async () => {
  await resetDatabase();
  await createDepartment({ code: 'CSE' });
  hod = await createHod({ departmentCode: 'CSE' });
  superAdmin = await createSuperAdmin();
  mentor = await createUser({ role: 'MENTOR', departmentCode: 'CSE', maxStudents: 100 });
  subject = await createSubject({ departmentCode: 'CSE', semester: 3 });
});

afterAll(() => prisma.$disconnect());

const entriesFor = (entityType, entityId) =>
  unauditedPrisma.auditLog.findMany({
    where: { entityType, ...(entityId ? { entityId } : {}) },
    orderBy: { createdAt: 'asc' },
  });

// An update stores a { from, to } diff; a create stores the whole row. Test
// fixtures are created directly, so filter to the diffs to find the change
// the test actually made.
const diffs = (entries, field) =>
  entries.filter(entry => entry.after?.[field] && typeof entry.after[field] === 'object' && 'from' in entry.after[field]);

describe('redaction and diffing', () => {
  it('never stores a password', () => {
    const safe = redact({ name: 'Asha', password: 'hunter2', nested: { password: 'x', keep: 1 } });

    expect(safe.password).toBe('[redacted]');
    expect(safe.nested.password).toBe('[redacted]');
    expect(safe.nested.keep).toBe(1);
    expect(safe.name).toBe('Asha');
  });

  it('records only the fields that changed', () => {
    const changes = changedFields({ a: 1, b: 2 }, { a: 1, b: 3 });

    expect(changes).toEqual({ b: { from: 2, to: 3 } });
    expect(changedFields({ a: 1 }, { a: 1 })).toBeNull();
  });
});

describe('what gets captured', () => {
  it('records who changed a mark, from what, to what', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const marks = (exam) => ({
      studentId: student.student.id,
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      test1: 18, test2: 18, assignment: 18, exam,
    });

    await request(app).post('/api/scores').set(authHeader(mentor)).send(marks(30));
    await request(app).post('/api/scores').set(authHeader(mentor)).send(marks(45));

    const entries = await entriesFor('Score');
    expect(entries.length).toBeGreaterThanOrEqual(2);

    const [change] = diffs(entries, 'exam');
    expect(change.actorId).toBe(mentor.id);
    expect(change.actorRole).toBe('MENTOR');
    expect(change.after.exam).toEqual({ from: 30, to: 45 });
    expect(change.createdAt).toBeInstanceOf(Date);
  });

  it('records a student status change', async () => {
    const student = await createStudent({ mentorId: mentor.id });

    await request(app).delete(`/api/students/${student.student.id}`).set(authHeader(hod));

    const [entry] = diffs(await entriesFor('Student', student.student.id), 'status');

    expect(entry.actorId).toBe(hod.id);
    expect(entry.after.status).toEqual({ from: 'ACTIVE', to: 'DROPPED' });
  });

  it('records a mentor assignment and a claim', async () => {
    const student = await createStudent({ departmentCode: 'CSE' });

    await request(app).put('/api/mentors/claim-student')
      .set(authHeader(mentor)).send({ studentId: student.student.id });

    const [claimed] = diffs(await entriesFor('Student', student.student.id), 'mentorId');
    expect(claimed.after.mentorId).toEqual({ from: null, to: mentor.id });

    const other = await createUser({ role: 'MENTOR', departmentCode: 'CSE' });
    await request(app).put(`/api/hod/students/${student.student.id}/assign`)
      .set(authHeader(hod)).send({ mentorId: other.id });

    const reassigned = diffs(await entriesFor('Student', student.student.id), 'mentorId').pop();
    expect(reassigned.actorId).toBe(hod.id);
    expect(reassigned.after.mentorId.to).toBe(other.id);
  });

  it('records attendance and alert resolution', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });

    await request(app).post('/api/attendance/bulk').set(authHeader(mentor)).send({
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: student.student.id, classesHeld: 40, classesAttended: 25 }],
    });

    expect((await entriesFor('Attendance')).length).toBeGreaterThan(0);

    const alert = await prisma.alert.findFirst({ where: { semesterRecord: { studentId: student.student.id } } });
    await request(app).put(`/api/alerts/${alert.id}/resolve`).set(authHeader(mentor));

    const [resolved] = diffs(await entriesFor('Alert', alert.id), 'resolved');
    expect(resolved.after.resolved).toEqual({ from: false, to: true });
  });

  it('records user creation, approval and role changes without the password', async () => {
    const created = await request(app).post('/api/auth/users').set(authHeader(hod)).send({
      name: 'New Mentor',
      email: 'audited@example.edu',
      password: 'PasswordLongEnough',
      role: 'MENTOR',
    });
    expect(created.status).toBe(201);

    const userEntries = await entriesFor('User');
    const createEntry = userEntries.find(
      entry => entry.action === 'User.create' && entry.after?.email === 'audited@example.edu'
    );

    expect(createEntry.actorId).toBe(hod.id);
    expect(JSON.stringify(createEntry.after)).not.toContain('PasswordLongEnough');
    expect(createEntry.after.password).toBe('[redacted]');

    const pending = await createUser({ approved: false, departmentCode: 'CSE' });
    await request(app).put(`/api/auth/users/${pending.id}/approve`).set(authHeader(hod));

    const [approval] = diffs(await entriesFor('User', pending.id), 'approved');
    expect(approval.after.approved).toEqual({ from: false, to: true });

    await request(app).put(`/api/auth/users/${pending.id}/role`)
      .set(authHeader(superAdmin)).send({ role: 'COORDINATOR' });

    const [roleChange] = diffs(await entriesFor('User', pending.id), 'role');
    expect(roleChange.actorId).toBe(superAdmin.id);
    expect(roleChange.after.role).toEqual({ from: 'MENTOR', to: 'COORDINATOR' });
  });

  it('records a batch promotion', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });

    await request(app).post(`/api/admin/batches/${student.student.batchId}/promote`)
      .set(authHeader(hod)).send({ fromSemester: 3 });

    const entries = await entriesFor('SemesterRollover');
    expect(entries).toHaveLength(1);
    expect(entries[0].actorId).toBe(hod.id);
  });

  it('records an import commit as one act', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data');
    worksheet.addRow(['Name', 'Roll Number', 'Department', 'Enrollment Year', 'Current Semester']);
    worksheet.addRow(['Asha Rao', 'AUD-1', 'CSE', 2024, 3]);
    const file = Buffer.from(await workbook.xlsx.writeBuffer());

    const preview = await request(app).post('/api/import/students/preview')
      .set(authHeader(mentor)).attach('file', file, 'students.xlsx');

    await request(app).post('/api/import/students/commit')
      .set(authHeader(mentor)).send({ importId: preview.body.importId });

    const [entry] = await entriesFor('Import');
    expect(entry.action).toBe('import.students');
    expect(entry.actorId).toBe(mentor.id);
    expect(entry.after).toMatchObject({ fileName: 'students.xlsx', created: 1 });
  });

  it('captures the ip and user agent of the request', async () => {
    const student = await createStudent({ mentorId: mentor.id });

    await request(app).put(`/api/students/${student.student.id}`)
      .set(authHeader(mentor))
      .set('User-Agent', 'AMIS-Test-Agent')
      .send({ name: 'Renamed' });

    const entry = (await entriesFor('Student', student.student.id)).pop();
    expect(entry.userAgent).toBe('AMIS-Test-Agent');
    expect(entry.ip).toBeTruthy();
  });
});

describe('GET /api/audit', () => {
  it('is closed to mentors and coordinators', async () => {
    expect((await request(app).get('/api/audit').set(authHeader(mentor))).status).toBe(403);

    const coordinator = await createUser({ role: 'COORDINATOR', departmentCode: 'CSE' });
    expect((await request(app).get('/api/audit').set(authHeader(coordinator))).status).toBe(403);
  });

  it('shows a HOD their own department only', async () => {
    await createDepartment({ code: 'ECE' });
    const eceHod = await createHod({ departmentCode: 'ECE' });
    const eceMentor = await createUser({ role: 'MENTOR', departmentCode: 'ECE' });
    const eceStudent = await createStudent({ mentorId: eceMentor.id, departmentCode: 'ECE' });

    await request(app).put(`/api/students/${eceStudent.student.id}`)
      .set(authHeader(eceMentor)).send({ name: 'ECE change' });

    const cseStudent = await createStudent({ mentorId: mentor.id, departmentCode: 'CSE' });
    await request(app).put(`/api/students/${cseStudent.student.id}`)
      .set(authHeader(mentor)).send({ name: 'CSE change' });

    const cseView = await request(app).get('/api/audit').set(authHeader(hod));
    const eceView = await request(app).get('/api/audit').set(authHeader(eceHod));

    expect(cseView.status).toBe(200);
    expect(cseView.body.entries.every(entry => entry.actorId !== eceMentor.id)).toBe(true);
    expect(eceView.body.entries.some(entry => entry.actorId === eceMentor.id)).toBe(true);
  });

  it('filters by entity, actor and date', async () => {
    const student = await createStudent({ mentorId: mentor.id });
    await request(app).put(`/api/students/${student.student.id}`)
      .set(authHeader(mentor)).send({ name: 'Filtered' });

    const byEntity = await request(app).get('/api/audit')
      .set(authHeader(hod)).query({ entityType: 'Student', entityId: student.student.id });
    expect(byEntity.body.entries.length).toBeGreaterThan(0);
    expect(byEntity.body.entries.every(entry => entry.entityType === 'Student')).toBe(true);

    const byActor = await request(app).get('/api/audit')
      .set(authHeader(hod)).query({ actorId: mentor.id });
    expect(byActor.body.entries.every(entry => entry.actorId === mentor.id)).toBe(true);

    const future = await request(app).get('/api/audit')
      .set(authHeader(hod)).query({ from: new Date(Date.now() + 86400000).toISOString() });
    expect(future.body.entries).toHaveLength(0);
  });

  it('has no endpoint that edits or deletes an entry', async () => {
    const student = await createStudent({ mentorId: mentor.id });
    const [entry] = await entriesFor('Student', student.student.id);

    for (const call of [
      request(app).put(`/api/audit/${entry.id}`).set(authHeader(superAdmin)).send({ action: 'tampered' }),
      request(app).delete(`/api/audit/${entry.id}`).set(authHeader(superAdmin)),
      request(app).post('/api/audit').set(authHeader(superAdmin)).send({ action: 'forged' }),
    ]) {
      const res = await call;
      expect([403, 404, 405]).toContain(res.status);
    }

    expect(await unauditedPrisma.auditLog.count({ where: { id: entry.id } })).toBe(1);
  });
});

describe('student activity', () => {
  it('reads as plain language for a mentor on their own student', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });

    await request(app).post('/api/scores').set(authHeader(mentor)).send({
      studentId: student.student.id,
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      test1: 20, test2: 20, assignment: 20, exam: 40,
    });

    const res = await request(app).get(`/api/audit/student/${student.student.id}`).set(authHeader(mentor));

    expect(res.status).toBe(200);
    expect(res.body.entries.length).toBeGreaterThan(0);
    expect(res.body.entries[0].summary).toMatch(new RegExp(mentor.name));
  });

  it("refuses another mentor's student", async () => {
    const other = await createUser({ role: 'MENTOR', departmentCode: 'CSE' });
    const theirs = await createStudent({ mentorId: other.id });

    const res = await request(app).get(`/api/audit/student/${theirs.student.id}`).set(authHeader(mentor));
    expect(res.status).toBe(403);
  });
});

describe('retention', () => {
  it('keeps three years and archives what falls outside', async () => {
    const student = await createStudent({ mentorId: mentor.id });
    await request(app).put(`/api/students/${student.student.id}`)
      .set(authHeader(mentor)).send({ name: 'Recent' });

    const old = await unauditedPrisma.auditLog.create({
      data: { action: 'Student.update', entityType: 'Student', entityId: student.student.id },
    });
    await unauditedPrisma.$executeRawUnsafe(
      `UPDATE "AuditLog" SET "createdAt" = NOW() - INTERVAL '4 years' WHERE id = '${old.id}'`
    );

    const dryRun = await pruneAudit({ dryRun: true });
    expect(dryRun.total).toBe(1);
    expect(await unauditedPrisma.auditLog.count({ where: { id: old.id } })).toBe(1);

    const archiveDir = 'archive/test-audit';
    const result = await pruneAudit({ archiveDir });

    expect(result.archived).toBe(1);
    expect(await unauditedPrisma.auditLog.count({ where: { id: old.id } })).toBe(0);
    // Entries inside the window are untouched.
    expect(await unauditedPrisma.auditLog.count()).toBeGreaterThan(0);
  });
});
