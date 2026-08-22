import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import app from '../src/app.js';
import { prisma, resetDatabase, createUser, createStudent, createSubject, authHeader, createHod } from './helpers.js';

let mentor, admin;

beforeEach(async () => {
  await resetDatabase();
  mentor = await createUser({ role: 'MENTOR' });
  admin = await createHod();
});

afterAll(() => prisma.$disconnect());

// Builds an .xlsx in memory so the tests exercise the real parser.
const sheet = async (headers, rows) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Data');
  worksheet.addRow(headers);
  for (const row of rows) worksheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

const upload = (type, user, buffer, fileName = 'upload.xlsx') =>
  request(app)
    .post(`/api/import/${type}/preview`)
    .set(authHeader(user))
    .attach('file', buffer, fileName);

const commit = (type, user, importId) =>
  request(app)
    .post(`/api/import/${type}/commit`)
    .set(authHeader(user))
    .send({ importId });

describe('templates', () => {
  it('returns an xlsx template per type', async () => {
    for (const type of ['students', 'subjects', 'marks']) {
      const res = await request(app)
        .get(`/api/import/${type}/template`)
        .set(authHeader(mentor))
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toContain(`amis-${type}-template.xlsx`);
      // A real xlsx is a zip archive, so it starts with "PK".
      expect(res.body.subarray(0, 2).toString()).toBe('PK');
    }
  });

  it('rejects an unknown type', async () => {
    const res = await request(app).get('/api/import/pizza/template').set(authHeader(mentor));
    expect(res.status).toBe(400);
  });
});

describe('student import', () => {
  const headers = ['Name', 'Roll Number', 'Department', 'Enrollment Year', 'Current Semester'];

  it('previews without writing, then commits', async () => {
    const file = await sheet(headers, [
      ['Asha Rao', 'R1', 'CSE', 2024, 3],
      ['Bala K', 'R2', 'CSE', 2024, 3],
    ]);

    const preview = await upload('students', mentor, file);
    expect(preview.status).toBe(200);
    expect(preview.body.summary).toMatchObject({ total: 2, toCreate: 2, invalid: 0 });
    expect(await prisma.student.count()).toBe(0);

    const res = await commit('students', mentor, preview.body.importId);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(2);

    const students = await prisma.student.findMany({ orderBy: { rollNumber: 'asc' } });
    expect(students).toHaveLength(2);
    // A mentor's import assigns the students to them.
    expect(students.every(s => s.mentorId === mentor.id)).toBe(true);
    // Every student gets a semester record to hang marks off.
    expect(await prisma.semesterRecord.count()).toBe(2);
  });

  it('commits nothing when 3 rows out of 50 are bad', async () => {
    // A roomy cap so the only failures are the ones this test plants.
    const bulkMentor = await createUser({ role: 'MENTOR', maxStudents: 100 });
    const rows = Array.from({ length: 50 }, (_, i) => ['Student ' + i, `R${i}`, 'CSE', 2024, 3]);
    rows[10][4] = 99;   // semester out of range
    rows[20][0] = '';   // missing name
    rows[30][3] = 'nope'; // enrollment year not a number

    const preview = await upload('students', bulkMentor, await sheet(headers, rows));
    expect(preview.body.summary.invalid).toBe(3);
    expect(preview.body.summary.toCreate).toBe(47);
    expect([...new Set(preview.body.errors.map(e => e.rowNumber))].sort((a, b) => a - b)).toEqual([12, 22, 32]);

    const res = await commit('students', bulkMentor, preview.body.importId);
    expect(res.status).toBe(400);
    expect(await prisma.student.count()).toBe(0);
  });

  it('rejects duplicate roll numbers inside the file', async () => {
    const file = await sheet(headers, [
      ['Asha Rao', 'R1', 'CSE', 2024, 3],
      ['Someone Else', 'R1', 'CSE', 2024, 3],
    ]);

    const preview = await upload('students', mentor, file);
    expect(preview.body.summary.invalid).toBe(1);
    expect(preview.body.errors[0].message).toMatch(/Duplicate Roll Number/);

    const res = await commit('students', mentor, preview.body.importId);
    expect(res.status).toBe(400);
    expect(await prisma.student.count()).toBe(0);
  });

  it('updates a student who already exists rather than duplicating', async () => {
    await createStudent({ mentorId: mentor.id });
    const existing = await prisma.student.findFirst();

    const file = await sheet(headers, [['Renamed', existing.rollNumber, 'ECE', 2024, 5]]);
    const preview = await upload('students', mentor, file);
    expect(preview.body.summary).toMatchObject({ toCreate: 0, toUpdate: 1 });

    await commit('students', mentor, preview.body.importId);

    const after = await prisma.student.findUnique({ where: { id: existing.id } });
    expect(after.name).toBe('Renamed');
    expect(after.department).toBe('ECE');
    expect(await prisma.student.count()).toBe(1);
  });

  it("refuses to touch another mentor's student", async () => {
    const other = await createUser({ role: 'MENTOR' });
    const theirs = await createStudent({ mentorId: other.id });

    const file = await sheet(headers, [['Stolen', theirs.student.rollNumber, 'CSE', 2024, 3]]);
    const preview = await upload('students', mentor, file);

    expect(preview.body.summary.invalid).toBe(1);
    expect(preview.body.errors[0].message).toMatch(/not in the group you look after/);
  });

  it('enforces the mentor capacity cap across the file', async () => {
    const small = await createUser({ role: 'MENTOR', maxStudents: 1 });

    const file = await sheet(headers, [
      ['One', 'R1', 'CSE', 2024, 3],
      ['Two', 'R2', 'CSE', 2024, 3],
    ]);

    const preview = await upload('students', small, file);
    expect(preview.body.summary.invalid).toBe(1);
    expect(preview.body.errors[0].message).toMatch(/limit of 1/);
  });

  it('lets an admin assign students to a mentor by email', async () => {
    const file = await sheet([...headers, 'Mentor Email'], [
      ['Asha Rao', 'R1', 'CSE', 2024, 3, mentor.email],
    ]);

    const preview = await upload('students', admin, file);
    expect(preview.body.summary.invalid).toBe(0);
    await commit('students', admin, preview.body.importId);

    const student = await prisma.student.findUnique({ where: { rollNumber: 'R1' } });
    expect(student.mentorId).toBe(mentor.id);
  });

  it('rejects a file that is missing a required column', async () => {
    const file = await sheet(['Name', 'Department'], [['Asha', 'CSE']]);
    const res = await upload('students', mentor, file);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required column/i);
  });

  it('reads csv as well as xlsx', async () => {
    const csv = 'Name,Roll Number,Department,Enrollment Year,Current Semester\nAsha Rao,R9,CSE,2024,3\n';
    const preview = await upload('students', mentor, Buffer.from(csv), 'students.csv');

    expect(preview.status).toBe(200);
    expect(preview.body.summary).toMatchObject({ total: 1, toCreate: 1, invalid: 0 });
  });
});

describe('subject import', () => {
  const headers = ['Code', 'Name', 'Department', 'Semester', 'Credits'];

  it('creates subjects with credits', async () => {
    const file = await sheet(headers, [['CS301', 'Data Structures', 'CSE', 3, 4]]);
    const preview = await upload('subjects', admin, file);
    expect(preview.body.summary.invalid).toBe(0);

    await commit('subjects', admin, preview.body.importId);

    const subject = await prisma.subject.findUnique({ where: { code: 'CS301' } });
    expect(subject.credits).toBe(4);
  });

  it('rejects missing or out-of-range credits', async () => {
    const file = await sheet(headers, [
      ['CS302', 'Algorithms', 'CSE', 3, ''],
      ['CS303', 'Networks', 'CSE', 3, 42],
    ]);

    const preview = await upload('subjects', admin, file);
    expect(preview.body.summary.invalid).toBe(2);
    expect(await prisma.subject.count()).toBe(0);
  });
});

describe('marks import', () => {
  const headers = ['Roll Number', 'Subject Code', 'Semester', 'Academic Year', 'Test 1', 'Test 2', 'Assignment', 'Exam'];

  it('produces the same finalScore and alerts as manual entry', async () => {
    const viaForm = await createStudent({ mentorId: mentor.id, semester: 3 });
    const viaImport = await createStudent({ mentorId: mentor.id, semester: 3 });
    const subject = await createSubject({ semester: 3 });
    await prisma.subject.update({ where: { id: subject.id }, data: { code: 'CS301' } });

    const marks = { test1: 8, test2: 20, assignment: 4, exam: 15 };

    const manual = await request(app).post('/api/scores').set(authHeader(mentor)).send({
      studentId: viaForm.student.id,
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      ...marks,
    });
    expect(manual.status).toBe(200);

    const file = await sheet(headers, [
      [viaImport.student.rollNumber, 'CS301', 3, 2026, marks.test1, marks.test2, marks.assignment, marks.exam],
    ]);
    const preview = await upload('marks', mentor, file);
    expect(preview.body.summary.invalid).toBe(0);
    const res = await commit('marks', mentor, preview.body.importId);
    expect(res.status).toBe(200);

    const imported = await prisma.score.findFirst({
      where: { semesterRecord: { studentId: viaImport.student.id } },
    });

    expect(imported.internalTotal).toBe(manual.body.internalTotal);
    expect(imported.finalScore).toBe(manual.body.finalScore);

    const alertsFor = async (studentId) => {
      const alerts = await prisma.alert.findMany({
        where: { semesterRecord: { studentId } },
        select: { type: true, severity: true, message: true },
        orderBy: { type: 'asc' },
      });
      return alerts;
    };

    expect(await alertsFor(viaImport.student.id)).toEqual(await alertsFor(viaForm.student.id));
    expect((await alertsFor(viaImport.student.id)).length).toBeGreaterThan(0);
  });

  it('rejects out-of-range marks with the source row number', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const subject = await createSubject({ semester: 3 });
    await prisma.subject.update({ where: { id: subject.id }, data: { code: 'CS301' } });

    const file = await sheet(headers, [
      [student.student.rollNumber, 'CS301', 3, 2026, 20, 20, 20, 40],
      [student.student.rollNumber, 'CS301', 3, 2026, 30, 20, 20, 40],
    ]);

    const preview = await upload('marks', mentor, file);
    // Row 3 is both a duplicate and out of range.
    expect(preview.body.summary.invalid).toBe(1);
    expect(preview.body.errors.every(e => e.rowNumber === 3)).toBe(true);

    const res = await commit('marks', mentor, preview.body.importId);
    expect(res.status).toBe(400);
    expect(await prisma.score.count()).toBe(0);
  });

  it("refuses marks for another mentor's mentee", async () => {
    const other = await createUser({ role: 'MENTOR' });
    const theirs = await createStudent({ mentorId: other.id, semester: 3 });
    const subject = await createSubject({ semester: 3 });
    await prisma.subject.update({ where: { id: subject.id }, data: { code: 'CS301' } });

    const file = await sheet(headers, [[theirs.student.rollNumber, 'CS301', 3, 2026, 20, 20, 20, 40]]);
    const preview = await upload('marks', mentor, file);

    expect(preview.body.summary.invalid).toBe(1);
    expect(preview.body.errors[0].message).toMatch(/not in the group you look after/);
  });

  it('flags unknown roll numbers and subject codes', async () => {
    const file = await sheet(headers, [['NOPE', 'ALSO-NOPE', 3, 2026, 20, 20, 20, 40]]);
    const preview = await upload('marks', mentor, file);

    const messages = preview.body.errors.map(e => e.message);
    expect(messages).toContain('No student with that Roll Number.');
    expect(messages).toContain('No subject with that code.');
  });
});

describe('pending imports', () => {
  it("will not let another user commit someone else's import", async () => {
    const file = await sheet(['Name', 'Roll Number', 'Department', 'Enrollment Year', 'Current Semester'],
      [['Asha Rao', 'R1', 'CSE', 2024, 3]]);

    const preview = await upload('students', mentor, file);
    const res = await commit('students', admin, preview.body.importId);

    expect(res.status).toBe(403);
    expect(await prisma.student.count()).toBe(0);
  });

  it('refuses an expired import', async () => {
    const file = await sheet(['Name', 'Roll Number', 'Department', 'Enrollment Year', 'Current Semester'],
      [['Asha Rao', 'R1', 'CSE', 2024, 3]]);

    const preview = await upload('students', mentor, file);
    await prisma.pendingImport.update({
      where: { id: preview.body.importId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await commit('students', mentor, preview.body.importId);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/);
    expect(await prisma.student.count()).toBe(0);
  });

  it('clears the pending row once committed, so it cannot be applied twice', async () => {
    const file = await sheet(['Name', 'Roll Number', 'Department', 'Enrollment Year', 'Current Semester'],
      [['Asha Rao', 'R1', 'CSE', 2024, 3]]);

    const preview = await upload('students', mentor, file);
    await commit('students', mentor, preview.body.importId);

    const second = await commit('students', mentor, preview.body.importId);
    expect(second.status).toBe(404);
    expect(await prisma.student.count()).toBe(1);
  });
});
