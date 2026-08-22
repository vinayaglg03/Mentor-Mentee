import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import app from '../src/app.js';
import { seedDemo, removeDemoData } from '../src/jobs/seedDemo.js';
import {
  prisma, resetDatabase, createUser, createStudent, createDepartment,
  createHod, createSuperAdmin, authHeader,
} from './helpers.js';

let superAdmin, hod, mentor;

beforeEach(async () => {
  await resetDatabase();
  superAdmin = await createSuperAdmin();
  hod = await createHod({ departmentCode: 'CSE' });
  mentor = await createUser({ role: 'MENTOR', departmentCode: 'CSE', maxStudents: 100 });
});

afterAll(() => prisma.$disconnect());

const sheet = async (headers, rows) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Data');
  worksheet.addRow(headers);
  for (const row of rows) worksheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

describe('setup status', () => {
  it('reports every step as undone on an empty install', async () => {
    await prisma.department.deleteMany({});
    await prisma.user.deleteMany({ where: { id: { not: superAdmin.id } } });

    const res = await request(app).get('/api/setup/status').set(authHeader(superAdmin));

    expect(res.status).toBe(200);
    expect(res.body.complete).toBe(false);
    expect(res.body.steps.map(step => step.key)).toEqual(
      ['institution', 'departments', 'faculty', 'students', 'subjects', 'mentors']
    );
    expect(res.body.steps.every(step => !step.done)).toBe(true);
  });

  it('is derived from the data, so leaving and coming back shows the truth', async () => {
    await request(app).put('/api/setup/institution').set(authHeader(superAdmin))
      .send({ name: 'Test College of Engineering' });

    await createStudent({ mentorId: mentor.id, departmentCode: 'CSE' });

    const res = await request(app).get('/api/setup/status').set(authHeader(superAdmin));
    const byKey = Object.fromEntries(res.body.steps.map(step => [step.key, step]));

    expect(byKey.institution.done).toBe(true);
    expect(byKey.departments.done).toBe(true);
    expect(byKey.students.done).toBe(true);
    expect(byKey.subjects.done).toBe(false);
    // The student already has a mentor, so nothing is outstanding.
    expect(byKey.mentors.remaining).toBe(0);
  });

  it('stores and returns the institution', async () => {
    const res = await request(app).put('/api/setup/institution').set(authHeader(superAdmin)).send({
      name: 'Test College of Engineering',
      shortName: 'TCE',
      currentAcademicYear: 2026,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'singleton', name: 'Test College of Engineering', shortName: 'TCE' });

    const again = await request(app).put('/api/setup/institution').set(authHeader(superAdmin))
      .send({ name: 'Renamed College' });

    expect(again.body.name).toBe('Renamed College');
    expect(await prisma.institution.count()).toBe(1);
  });

  it('keeps a resumable state blob', async () => {
    await request(app).put('/api/setup/state').set(authHeader(superAdmin))
      .send({ setupState: { lastStep: 'faculty' } });

    const res = await request(app).get('/api/setup/status').set(authHeader(superAdmin));
    expect(res.body.institution.setupState).toEqual({ lastStep: 'faculty' });
  });

  it('refuses a HOD setting up the institution', async () => {
    const res = await request(app).put('/api/setup/institution').set(authHeader(hod))
      .send({ name: 'Not allowed' });

    expect(res.status).toBe(403);
  });
});

describe('faculty import', () => {
  const headers = ['Name', 'Email', 'Role', 'Department', 'Max Students'];

  it('creates approved accounts that sign in with Google', async () => {
    const file = await sheet(headers, [
      ['Dr. Meera Nair', 'meera@college.edu.in', 'MENTOR', 'CSE', 25],
      ['Prof. Anil Kumar', 'anil@college.edu.in', 'COORDINATOR', 'CSE', 30],
    ]);

    const preview = await request(app).post('/api/import/faculty/preview')
      .set(authHeader(superAdmin)).attach('file', file, 'faculty.xlsx');

    expect(preview.body.summary).toMatchObject({ total: 2, toCreate: 2, invalid: 0 });

    const res = await request(app).post('/api/import/faculty/commit')
      .set(authHeader(superAdmin)).send({ importId: preview.body.importId });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(2);

    const created = await prisma.user.findUnique({ where: { email: 'meera@college.edu.in' } });
    expect(created).toMatchObject({ role: 'MENTOR', approved: true, maxStudents: 25 });
    expect(created.departmentId).toBeTruthy();
  });

  it('updates an account that already exists rather than duplicating it', async () => {
    const existing = await createUser({ role: 'MENTOR', departmentCode: 'CSE' });
    const file = await sheet(headers, [['Renamed Person', existing.email, 'COORDINATOR', 'CSE', 40]]);

    const preview = await request(app).post('/api/import/faculty/preview')
      .set(authHeader(superAdmin)).attach('file', file, 'faculty.xlsx');

    expect(preview.body.summary).toMatchObject({ toCreate: 0, toUpdate: 1 });

    await request(app).post('/api/import/faculty/commit')
      .set(authHeader(superAdmin)).send({ importId: preview.body.importId });

    const after = await prisma.user.findUnique({ where: { id: existing.id } });
    expect(after).toMatchObject({ name: 'Renamed Person', role: 'COORDINATOR', maxStudents: 40 });
  });

  it('stops a HOD importing another HOD', async () => {
    const file = await sheet(headers, [['Someone Senior', 'senior@college.edu.in', 'HOD', 'CSE', 30]]);

    const preview = await request(app).post('/api/import/faculty/preview')
      .set(authHeader(hod)).attach('file', file, 'faculty.xlsx');

    expect(preview.body.summary.invalid).toBe(1);
    expect(preview.body.errors[0].message).toMatch(/super admin/);
  });

  it('rejects a mentor importing faculty at all', async () => {
    const file = await sheet(headers, [['Anybody', 'anybody@college.edu.in', 'MENTOR', 'CSE', 30]]);

    const preview = await request(app).post('/api/import/faculty/preview')
      .set(authHeader(mentor)).attach('file', file, 'faculty.xlsx');

    expect(preview.body.summary.invalid).toBe(1);
    expect(await prisma.user.count({ where: { email: 'anybody@college.edu.in' } })).toBe(0);
  });

  it('flags a bad email and a bad role with the row number', async () => {
    const file = await sheet(headers, [
      ['No Email', 'not-an-email', 'MENTOR', 'CSE', 30],
      ['Bad Role', 'ok@college.edu.in', 'WIZARD', 'CSE', 30],
    ]);

    const preview = await request(app).post('/api/import/faculty/preview')
      .set(authHeader(superAdmin)).attach('file', file, 'faculty.xlsx');

    expect(preview.body.summary.invalid).toBe(2);
    expect(preview.body.errors.map(error => error.rowNumber).sort()).toEqual([2, 3]);
  });
});

describe('assigning mentors', () => {
  it('previews an even distribution without changing anything', async () => {
    const second = await createUser({ role: 'MENTOR', departmentCode: 'CSE', maxStudents: 100 });
    for (let i = 0; i < 6; i++) await createStudent({ departmentCode: 'CSE' });

    const res = await request(app).post('/api/setup/assign-mentors')
      .set(authHeader(hod)).send({ preview: true });

    expect(res.status).toBe(200);
    expect(res.body.summary.toAssign).toBe(6);
    expect(res.body.summary.perMentor.map(entry => entry.after).sort()).toEqual([3, 3]);
    expect(res.body.summary.perMentor.map(entry => entry.id).sort())
      .toEqual([mentor.id, second.id].sort());

    // Nothing has moved.
    expect(await prisma.student.count({ where: { mentorId: null } })).toBe(6);
  });

  it('applies it, evening out an existing imbalance', async () => {
    const second = await createUser({ role: 'MENTOR', departmentCode: 'CSE', maxStudents: 100 });
    for (let i = 0; i < 4; i++) await createStudent({ mentorId: mentor.id, departmentCode: 'CSE' });
    for (let i = 0; i < 4; i++) await createStudent({ departmentCode: 'CSE' });

    const res = await request(app).post('/api/setup/assign-mentors').set(authHeader(hod)).send({});

    expect(res.status).toBe(200);
    expect(await prisma.student.count({ where: { mentorId: null } })).toBe(0);

    // The emptier mentor is filled first, so it ends 4 / 4 rather than 8 / 0.
    expect(await prisma.student.count({ where: { mentorId: second.id } })).toBe(4);
  });

  it('respects each mentor\'s cap and reports who could not be placed', async () => {
    await prisma.user.update({ where: { id: mentor.id }, data: { maxStudents: 2 } });
    for (let i = 0; i < 5; i++) await createStudent({ departmentCode: 'CSE' });

    const res = await request(app).post('/api/setup/assign-mentors').set(authHeader(hod)).send({});

    expect(res.body.unplaced).toHaveLength(3);
    expect(res.body.unplaced[0].reason).toMatch(/limit/);
    expect(await prisma.student.count({ where: { mentorId: mentor.id } })).toBe(2);
  });

  it('never crosses departments', async () => {
    await createDepartment({ code: 'ECE' });
    const eceMentor = await createUser({ role: 'MENTOR', departmentCode: 'ECE', maxStudents: 100 });
    const eceStudent = await createStudent({ departmentCode: 'ECE' });
    await createStudent({ departmentCode: 'CSE' });

    await request(app).post('/api/setup/assign-mentors').set(authHeader(superAdmin)).send({});

    const student = await prisma.student.findUnique({ where: { id: eceStudent.student.id } });
    expect(student.mentorId).toBe(eceMentor.id);
  });

  it('refuses a mentor', async () => {
    const res = await request(app).post('/api/setup/assign-mentors').set(authHeader(mentor)).send({});
    expect(res.status).toBe(403);
  });

  it('says what to do when there are no mentors', async () => {
    await prisma.user.deleteMany({ where: { role: 'MENTOR' } });
    await createStudent({ departmentCode: 'CSE' });

    const res = await request(app).post('/api/setup/assign-mentors').set(authHeader(hod)).send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Import faculty/);
  });

  it('bulk-assigns a named list to one mentor', async () => {
    const a = await createStudent({ departmentCode: 'CSE' });
    const b = await createStudent({ departmentCode: 'CSE' });

    const res = await request(app).post('/api/setup/assign-to-mentor').set(authHeader(hod))
      .send({ mentorId: mentor.id, studentIds: [a.student.id, b.student.id] });

    expect(res.status).toBe(200);
    expect(await prisma.student.count({ where: { mentorId: mentor.id } })).toBe(2);
  });
});

describe('demo mode', () => {
  // Seeding writes several hundred rows through the same helpers the app
  // uses, which is the point of it, but it is not quick.
  vi.setConfig({ testTimeout: 300000, hookTimeout: 300000 });

  it('creates a flagged department a reviewer can look at', async () => {
    const result = await seedDemo();

    expect(result.students).toBe(30);
    expect(result.subjects).toBe(6);
    expect(result.alerts).toBeGreaterThan(0);

    const students = await prisma.student.findMany({ where: { isDemo: true } });
    expect(students).toHaveLength(30);
    expect(students.every(student => student.mentorId)).toBe(true);

    // Marks, attendance, GPA and logs, so the dashboards have something in
    // them rather than an empty shell.
    expect(await prisma.score.count()).toBeGreaterThan(100);
    expect(await prisma.attendance.count()).toBeGreaterThan(100);
    expect(await prisma.progressLog.count()).toBeGreaterThan(0);

    const record = await prisma.semesterRecord.findFirst({ where: { student: { isDemo: true } } });
    expect(record.sgpa).toBeGreaterThan(0);
  });

  it('is visible to the status endpoint so the app can flag it', async () => {
    await seedDemo({ students: 4 });

    const res = await request(app).get('/api/setup/status').set(authHeader(superAdmin));
    expect(res.body.demoDataPresent).toBe(true);
  });

  it('removes cleanly and leaves real data alone', async () => {
    const real = await createStudent({ mentorId: mentor.id, departmentCode: 'CSE' });
    await seedDemo({ students: 4 });

    const removed = await removeDemoData();

    expect(removed.students).toBe(4);
    expect(await prisma.student.count({ where: { isDemo: true } })).toBe(0);
    expect(await prisma.user.count({ where: { isDemo: true } })).toBe(0);
    expect(await prisma.subject.count({ where: { isDemo: true } })).toBe(0);
    expect(await prisma.department.count({ where: { isDemo: true } })).toBe(0);

    // The real student is untouched.
    expect(await prisma.student.findUnique({ where: { id: real.student.id } })).not.toBeNull();
  }, 120000);

  it('replaces itself rather than stacking when run twice', async () => {
    await seedDemo({ students: 4 });
    await seedDemo({ students: 4 });

    expect(await prisma.student.count({ where: { isDemo: true } })).toBe(4);
  });
});
