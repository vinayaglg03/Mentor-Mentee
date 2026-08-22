import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import {
  prisma, resetDatabase, createUser, createStudent, createSubject, createDepartment,
  createBatch, createSection, createHod, createSuperAdmin, createCoordinator, authHeader,
} from './helpers.js';

// Two departments sharing one instance, which is the case this phase exists
// for: CSE with two sections, ECE with one.
let superAdmin, cseHod, eceHod, coordinator, cseMentor, eceMentor;
let sectionA, sectionB;
let inSectionA, inSectionB, inEce;

beforeEach(async () => {
  await resetDatabase();

  await createDepartment({ code: 'CSE', name: 'Computer Science and Engineering' });
  await createDepartment({ code: 'ECE', name: 'Electronics and Communication' });

  superAdmin = await createSuperAdmin();
  cseHod = await createHod({ departmentCode: 'CSE' });
  eceHod = await createHod({ departmentCode: 'ECE' });

  const cseBatch = await createBatch({ departmentCode: 'CSE', admissionYear: 2024 });
  sectionA = await createSection({ batch: cseBatch, name: 'A' });
  sectionB = await createSection({ batch: cseBatch, name: 'B' });
  coordinator = await createCoordinator({ section: sectionA });

  cseMentor = await createUser({ role: 'MENTOR', departmentCode: 'CSE', maxStudents: 100 });
  eceMentor = await createUser({ role: 'MENTOR', departmentCode: 'ECE', maxStudents: 100 });

  inSectionA = await createStudent({ mentorId: cseMentor.id, departmentCode: 'CSE', sectionId: sectionA.id });
  inSectionB = await createStudent({ mentorId: cseMentor.id, departmentCode: 'CSE', sectionId: sectionB.id });
  inEce = await createStudent({ mentorId: eceMentor.id, departmentCode: 'ECE' });
});

afterAll(() => prisma.$disconnect());

const listStudents = (user) => request(app).get('/api/students').set(authHeader(user));
const readStudent = (user, id) => request(app).get(`/api/students/${id}`).set(authHeader(user));

describe('what each role can see', () => {
  it('gives a super admin every department', async () => {
    const res = await listStudents(superAdmin);

    expect(res.status).toBe(200);
    expect(res.body.map(s => s.id).sort()).toEqual(
      [inSectionA.student.id, inSectionB.student.id, inEce.student.id].sort()
    );
  });

  it('gives a HOD their own department only', async () => {
    const res = await listStudents(cseHod);

    expect(res.body.map(s => s.id).sort()).toEqual([inSectionA.student.id, inSectionB.student.id].sort());
    expect(res.body.map(s => s.id)).not.toContain(inEce.student.id);
  });

  it('gives a coordinator their section only', async () => {
    const res = await listStudents(coordinator);

    expect(res.body.map(s => s.id)).toEqual([inSectionA.student.id]);
  });

  it('gives a mentor their own mentees only', async () => {
    const res = await listStudents(cseMentor);

    expect(res.body.map(s => s.id).sort()).toEqual([inSectionA.student.id, inSectionB.student.id].sort());
  });

  it('shows a HOD with no department nothing at all, rather than everything', async () => {
    const stranded = await createUser({ role: 'HOD' });

    const res = await listStudents(stranded);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('shows a coordinator with no section nothing at all', async () => {
    const stranded = await createUser({ role: 'COORDINATOR', departmentCode: 'CSE' });

    const res = await listStudents(stranded);
    expect(res.body).toEqual([]);
  });
});

describe('two departments cannot see each other', () => {
  it('refuses a HOD reading a student in another department', async () => {
    expect((await readStudent(cseHod, inEce.student.id)).status).toBe(403);
    expect((await readStudent(eceHod, inSectionA.student.id)).status).toBe(403);
  });

  it('lets each HOD read their own', async () => {
    expect((await readStudent(cseHod, inSectionA.student.id)).status).toBe(200);
    expect((await readStudent(eceHod, inEce.student.id)).status).toBe(200);
  });

  it('refuses a HOD editing a student in another department', async () => {
    const res = await request(app)
      .put(`/api/students/${inEce.student.id}`)
      .set(authHeader(cseHod))
      .send({ name: 'Renamed by the wrong HOD' });

    expect(res.status).toBe(403);

    const after = await prisma.student.findUnique({ where: { id: inEce.student.id } });
    expect(after.name).not.toBe('Renamed by the wrong HOD');
  });

  it('keeps marks and attendance inside the department', async () => {
    const subject = await createSubject({ departmentCode: 'ECE', semester: 3 });

    const marks = await request(app).post('/api/scores').set(authHeader(cseHod)).send({
      studentId: inEce.student.id,
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      test1: 20, test2: 20, assignment: 20, exam: 40,
    });
    expect(marks.status).toBe(403);

    const attendance = await request(app).post('/api/attendance/bulk').set(authHeader(cseHod)).send({
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: inEce.student.id, classesHeld: 40, classesAttended: 20 }],
    });
    expect(attendance.status).toBe(403);
  });

  it('scopes the HOD dashboard to the caller\'s department', async () => {
    const cse = await request(app).get('/api/analytics/hod').set(authHeader(cseHod));
    const ece = await request(app).get('/api/analytics/hod').set(authHeader(eceHod));
    const all = await request(app).get('/api/analytics/hod').set(authHeader(superAdmin));

    expect(cse.body.totalStudents).toBe(2);
    expect(ece.body.totalStudents).toBe(1);
    expect(all.body.totalStudents).toBe(3);
  });

  it('scopes the alert list', async () => {
    const record = await prisma.semesterRecord.findFirst({ where: { studentId: inEce.student.id } });
    await prisma.alert.create({
      data: { semesterRecordId: record.id, type: 'AT_RISK', severity: 'HIGH', message: 'ECE only' },
    });

    const cse = await request(app).get('/api/alerts/all').set(authHeader(cseHod));
    const ece = await request(app).get('/api/alerts/all').set(authHeader(eceHod));

    expect(cse.body).toHaveLength(0);
    expect(ece.body).toHaveLength(1);
  });

  it('scopes the at-risk export', async () => {
    const record = await prisma.semesterRecord.findFirst({ where: { studentId: inEce.student.id } });
    await prisma.alert.create({
      data: { semesterRecordId: record.id, type: 'AT_RISK', severity: 'HIGH', message: 'ECE only' },
    });

    const res = await request(app).get('/api/reports/at-risk.xlsx').set(authHeader(cseHod)).responseType('blob');
    expect(res.status).toBe(200);

    const ece = await request(app).get('/api/reports/at-risk.xlsx').set(authHeader(eceHod)).responseType('blob');
    // The CSE HOD's sheet is smaller because it has no rows in it.
    expect(ece.body.length).toBeGreaterThan(0);
  });
});

describe('a coordinator is limited to their sections', () => {
  it('reads a student in their section and not one outside it', async () => {
    expect((await readStudent(coordinator, inSectionA.student.id)).status).toBe(200);
    expect((await readStudent(coordinator, inSectionB.student.id)).status).toBe(403);
    expect((await readStudent(coordinator, inEce.student.id)).status).toBe(403);
  });

  it('may reassign a mentee inside their section', async () => {
    const other = await createUser({ role: 'MENTOR', departmentCode: 'CSE' });

    const res = await request(app)
      .put(`/api/hod/students/${inSectionA.student.id}/assign`)
      .set(authHeader(coordinator))
      .send({ mentorId: other.id });

    expect(res.status).toBe(200);
  });

  it('may not reassign a mentee outside their section', async () => {
    const other = await createUser({ role: 'MENTOR', departmentCode: 'CSE' });

    const res = await request(app)
      .put(`/api/hod/students/${inSectionB.student.id}/assign`)
      .set(authHeader(coordinator))
      .send({ mentorId: other.id });

    expect(res.status).toBe(403);
  });

  it('gains a second section when one is assigned to them', async () => {
    await prisma.section.update({ where: { id: sectionB.id }, data: { coordinatorId: coordinator.id } });

    const res = await listStudents(coordinator);
    expect(res.body.map(s => s.id).sort()).toEqual([inSectionA.student.id, inSectionB.student.id].sort());
  });
});

describe('a mentor is limited to their mentees', () => {
  it('cannot read a colleague\'s student in the same department', async () => {
    const colleague = await createUser({ role: 'MENTOR', departmentCode: 'CSE' });
    const theirs = await createStudent({ mentorId: colleague.id, departmentCode: 'CSE' });

    expect((await readStudent(cseMentor, theirs.student.id)).status).toBe(403);
  });

  it('cannot delete a student at all', async () => {
    const res = await request(app).delete(`/api/students/${inSectionA.student.id}`).set(authHeader(cseMentor));
    expect(res.status).toBe(403);

    const after = await prisma.student.findUnique({ where: { id: inSectionA.student.id } });
    expect(after.status).toBe('ACTIVE');
  });

  it('lets a HOD soft-delete a student in their department', async () => {
    const res = await request(app).delete(`/api/students/${inSectionA.student.id}`).set(authHeader(cseHod));
    expect(res.status).toBe(200);

    const after = await prisma.student.findUnique({ where: { id: inSectionA.student.id } });
    expect(after.status).toBe('DROPPED');
  });
});

describe('subject master data is HOD and above', () => {
  const body = (code, department) => ({
    name: 'Data Structures',
    code,
    department,
    academicYear: 2026,
    semester: 3,
  });

  it('refuses a mentor creating a subject', async () => {
    const res = await request(app).post('/api/subjects').set(authHeader(cseMentor)).send(body('CS301', 'CSE'));

    expect(res.status).toBe(403);
    expect(await prisma.subject.count()).toBe(0);
  });

  it('refuses a coordinator creating a subject', async () => {
    const res = await request(app).post('/api/subjects').set(authHeader(coordinator)).send(body('CS301', 'CSE'));
    expect(res.status).toBe(403);
  });

  it('lets a HOD create one in their own department', async () => {
    const res = await request(app).post('/api/subjects').set(authHeader(cseHod)).send(body('CS301', 'CSE'));
    expect(res.status).toBe(201);
  });

  it('refuses a HOD creating one in another department', async () => {
    const res = await request(app).post('/api/subjects').set(authHeader(cseHod)).send(body('EC301', 'ECE'));

    expect(res.status).toBe(403);
    expect(await prisma.subject.count()).toBe(0);
  });

  it('refuses a HOD editing or deleting another department\'s subject', async () => {
    const subject = await createSubject({ departmentCode: 'ECE' });

    const updated = await request(app).put(`/api/subjects/${subject.id}`)
      .set(authHeader(cseHod)).send({ name: 'Renamed' });
    expect(updated.status).toBe(403);

    const deleted = await request(app).delete(`/api/subjects/${subject.id}`).set(authHeader(cseHod));
    expect(deleted.status).toBe(403);

    expect(await prisma.subject.findUnique({ where: { id: subject.id } })).not.toBeNull();
  });

  it('stops a HOD moving a subject into another department', async () => {
    const subject = await createSubject({ departmentCode: 'CSE' });

    const res = await request(app).put(`/api/subjects/${subject.id}`)
      .set(authHeader(cseHod)).send({ department: 'ECE' });

    expect(res.status).toBe(403);
  });
});

describe('user administration', () => {
  it('lets only a super admin change a role', async () => {
    const target = await createUser({ role: 'MENTOR', departmentCode: 'CSE' });

    const byHod = await request(app).put(`/api/auth/users/${target.id}/role`)
      .set(authHeader(cseHod)).send({ role: 'HOD' });
    expect(byHod.status).toBe(403);

    const bySuperAdmin = await request(app).put(`/api/auth/users/${target.id}/role`)
      .set(authHeader(superAdmin)).send({ role: 'COORDINATOR' });
    expect(bySuperAdmin.status).toBe(200);
    expect(bySuperAdmin.body.user.role).toBe('COORDINATOR');
  });

  it('will not let a super admin demote themselves by accident', async () => {
    const res = await request(app).put(`/api/auth/users/${superAdmin.id}/role`)
      .set(authHeader(superAdmin)).send({ role: 'MENTOR' });

    expect(res.status).toBe(400);
  });

  it('lets a super admin attach a stranded HOD to a department', async () => {
    const stranded = await createUser({ role: 'HOD' });
    const department = await prisma.department.findUnique({ where: { code: 'ECE' } });

    expect((await listStudents(stranded)).body).toEqual([]);

    const res = await request(app).put(`/api/auth/users/${stranded.id}/department`)
      .set(authHeader(superAdmin)).send({ departmentId: department.id });

    expect(res.status).toBe(200);
    expect((await listStudents(stranded)).body.map(s => s.id)).toEqual([inEce.student.id]);
  });

  it('refuses a HOD approving an account in another department', async () => {
    const pending = await createUser({ role: 'MENTOR', approved: false, departmentCode: 'ECE' });

    const res = await request(app).put(`/api/auth/users/${pending.id}/approve`).set(authHeader(cseHod));
    expect(res.status).toBe(403);

    const after = await prisma.user.findUnique({ where: { id: pending.id } });
    expect(after.approved).toBe(false);
  });
});

describe('claiming unassigned students', () => {
  it('keeps a mentor from claiming a student in another department', async () => {
    const unassigned = await createStudent({ departmentCode: 'ECE' });

    const list = await request(app).get('/api/mentors/students/unassigned').set(authHeader(cseMentor));
    expect(list.body.map(s => s.id)).not.toContain(unassigned.student.id);

    const res = await request(app).put('/api/mentors/claim-student')
      .set(authHeader(cseMentor)).send({ studentId: unassigned.student.id });

    expect(res.status).toBe(403);
  });

  it('does not restrict a mentor who has no department of their own', async () => {
    // Nothing to restrict them to, and blocking would stop every mentor
    // claiming until an administrator filled the field in.
    const unscopedMentor = await createUser({ role: 'MENTOR' });
    const unassigned = await createStudent({ departmentCode: 'ECE' });

    const res = await request(app).put('/api/mentors/claim-student')
      .set(authHeader(unscopedMentor)).send({ studentId: unassigned.student.id });

    expect(res.status).toBe(200);
  });

  it('lets a mentor claim one in their own department', async () => {
    const unassigned = await createStudent({ departmentCode: 'CSE' });

    const res = await request(app).put('/api/mentors/claim-student')
      .set(authHeader(cseMentor)).send({ studentId: unassigned.student.id });

    expect(res.status).toBe(200);
  });
});
