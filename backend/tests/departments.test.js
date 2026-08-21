import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import app from '../src/app.js';
import { prisma, resetDatabase, createUser, createStudent, createSubject, createDepartment, authHeader } from './helpers.js';
import { resolveDepartmentCode, DEPARTMENT_ALIASES } from '../src/jobs/departmentReport.js';

let mentor, admin;

beforeEach(async () => {
  await resetDatabase();
  mentor = await createUser({ role: 'MENTOR', maxStudents: 100 });
  admin = await createUser({ role: 'ADMIN' });
});

afterAll(() => prisma.$disconnect());

const sheet = async (headers, rows) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Data');
  worksheet.addRow(headers);
  for (const row of rows) worksheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

describe('department normalisation', () => {
  it('folds whitespace and case onto one code', () => {
    expect(resolveDepartmentCode(' CSBS')).toBe('CSBS');
    expect(resolveDepartmentCode('csbs')).toBe('CSBS');
    expect(resolveDepartmentCode('CSBS ')).toBe('CSBS');
  });

  it('maps the long forms through the alias table', () => {
    expect(resolveDepartmentCode('Computer Science and Engineering')).toBe('CSE');
    expect(resolveDepartmentCode('Computer Science & Business Systems')).toBe('CSBS');
    expect(DEPARTMENT_ALIASES.CS).toBe('CSE');
  });

  it('keeps an unknown code rather than guessing, and rejects a blank', () => {
    expect(resolveDepartmentCode('ECE')).toBe('ECE');
    expect(resolveDepartmentCode('   ')).toBeNull();
    expect(resolveDepartmentCode(null)).toBeNull();
  });
});

describe('GET /api/departments', () => {
  it('lists departments with their counts', async () => {
    await createStudent({ mentorId: mentor.id, departmentCode: 'CSE' });
    await createStudent({ mentorId: mentor.id, departmentCode: 'ECE' });
    await createSubject({ departmentCode: 'CSE' });

    const res = await request(app).get('/api/departments').set(authHeader(mentor));

    expect(res.status).toBe(200);
    expect(res.body.map(d => d.code).sort()).toEqual(['CSE', 'ECE']);

    const cse = res.body.find(d => d.code === 'CSE');
    expect(cse).toMatchObject({ students: 1, subjects: 1, batches: 1 });
  });

  it('needs a signed-in user', async () => {
    const res = await request(app).get('/api/departments');
    expect(res.status).toBe(401);
  });

  it('lets an admin create one and refuses a mentor', async () => {
    const created = await request(app).post('/api/departments').set(authHeader(admin))
      .send({ code: 'me', name: 'Mechanical Engineering' });

    expect(created.status).toBe(201);
    // Codes are normalised on the way in.
    expect(created.body.code).toBe('ME');

    const refused = await request(app).post('/api/departments').set(authHeader(mentor))
      .send({ code: 'CV', name: 'Civil' });

    expect(refused.status).toBe(403);
  });
});

describe('batches', () => {
  it('creates one batch per department and admission year', async () => {
    await createStudent({ mentorId: mentor.id, departmentCode: 'CSE', admissionYear: 2024 });
    await createStudent({ mentorId: mentor.id, departmentCode: 'CSE', admissionYear: 2024 });
    await createStudent({ mentorId: mentor.id, departmentCode: 'CSE', admissionYear: 2025 });
    await createStudent({ mentorId: mentor.id, departmentCode: 'ECE', admissionYear: 2024 });

    const res = await request(app).get('/api/departments/batches').set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);

    const cse2024 = res.body.find(b => b.department.code === 'CSE' && b.admissionYear === 2024);
    expect(cse2024.students).toBe(2);
  });

  it('filters batches by department', async () => {
    await createStudent({ mentorId: mentor.id, departmentCode: 'CSE' });
    await createStudent({ mentorId: mentor.id, departmentCode: 'ECE' });

    const department = await prisma.department.findUnique({ where: { code: 'ECE' } });
    const res = await request(app).get('/api/departments/batches')
      .set(authHeader(admin))
      .query({ departmentId: department.id });

    expect(res.body).toHaveLength(1);
    expect(res.body[0].department.code).toBe('ECE');
  });

  it('creates a section against a batch', async () => {
    const { student } = await createStudent({ mentorId: mentor.id });
    const coordinator = await createUser({ role: 'MENTOR' });

    const res = await request(app).post('/api/departments/sections').set(authHeader(admin))
      .send({ batchId: student.batchId, name: 'a', coordinatorId: coordinator.id });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('A');
    expect(res.body.coordinatorId).toBe(coordinator.id);
  });
});

describe('writes resolve the department relation', () => {
  it('creates the department and batch when a student is added', async () => {
    const res = await request(app).post('/api/students').set(authHeader(mentor)).send({
      name: 'Asha Rao',
      rollNumber: 'R-NEW-1',
      department: ' ece ',
      currentYear: 1,
      currentSemester: 1,
      currentAcademicYear: 2026,
      enrollmentYear: 2026,
    });

    expect(res.status).toBe(201);

    const student = await prisma.student.findUnique({
      where: { id: res.body.id },
      include: { departmentRef: true, batch: true },
    });

    expect(student.departmentRef.code).toBe('ECE');
    expect(student.batch.admissionYear).toBe(2026);
    // The deprecated string column is kept in step for the rollback window.
    expect(student.department).toBe('ECE');
  });

  it('reuses an existing department rather than creating a variant', async () => {
    await createDepartment({ code: 'CSE', name: 'Computer Science and Engineering' });

    await request(app).post('/api/students').set(authHeader(mentor)).send({
      name: 'Bala K',
      rollNumber: 'R-NEW-2',
      department: 'cse',
      currentYear: 1,
      currentSemester: 1,
      currentAcademicYear: 2026,
      enrollmentYear: 2026,
    });

    const departments = await prisma.department.findMany();
    expect(departments).toHaveLength(1);
    expect(departments[0].name).toBe('Computer Science and Engineering');
  });

  it('links a subject to its department', async () => {
    const res = await request(app).post('/api/subjects').set(authHeader(admin)).send({
      name: 'Signals',
      code: 'EC301',
      department: 'ECE',
      academicYear: 2026,
      semester: 3,
    });

    expect(res.status).toBe(201);

    const subject = await prisma.subject.findUnique({
      where: { id: res.body.id },
      include: { departmentRef: true },
    });
    expect(subject.departmentRef.code).toBe('ECE');
  });

  it('filters subjects by department code', async () => {
    await createSubject({ departmentCode: 'CSE' });
    await createSubject({ departmentCode: 'ECE' });

    const res = await request(app).get('/api/subjects').set(authHeader(mentor)).query({ department: 'ece' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].department).toBe('ECE');
  });
});

describe('imports resolve the department relation', () => {
  it('creates departments and batches from a student import', async () => {
    const file = await sheet(
      ['Name', 'Roll Number', 'Department', 'Enrollment Year', 'Current Semester'],
      [
        ['Asha Rao', 'IMP-1', 'ece', 2024, 3],
        ['Bala K', 'IMP-2', ' ECE ', 2024, 3],
        ['Chandni P', 'IMP-3', 'CSE', 2025, 1],
      ]
    );

    const preview = await request(app).post('/api/import/students/preview')
      .set(authHeader(mentor)).attach('file', file, 'students.xlsx');

    expect(preview.body.summary.invalid).toBe(0);

    const res = await request(app).post('/api/import/students/commit')
      .set(authHeader(mentor)).send({ importId: preview.body.importId });

    expect(res.status).toBe(200);

    const departments = await prisma.department.findMany({ orderBy: { code: 'asc' } });
    // "ece" and " ECE " are the same department, not two.
    expect(departments.map(d => d.code)).toEqual(['CSE', 'ECE']);

    const batches = await prisma.batch.findMany();
    expect(batches).toHaveLength(2);

    const students = await prisma.student.findMany({ include: { departmentRef: true } });
    expect(students.every(s => s.departmentId)).toBe(true);
    expect(students.filter(s => s.departmentRef.code === 'ECE')).toHaveLength(2);
  });

  it('links imported subjects to their department', async () => {
    const file = await sheet(
      ['Code', 'Name', 'Department', 'Semester', 'Credits'],
      [['EC301', 'Signals', 'ece', 3, 4]]
    );

    const preview = await request(app).post('/api/import/subjects/preview')
      .set(authHeader(admin)).attach('file', file, 'subjects.xlsx');

    await request(app).post('/api/import/subjects/commit')
      .set(authHeader(admin)).send({ importId: preview.body.importId });

    const subject = await prisma.subject.findUnique({
      where: { code: 'EC301' },
      include: { departmentRef: true },
    });

    expect(subject.departmentRef.code).toBe('ECE');
  });
});

describe('class views are scoped by department relation', () => {
  it('does not mix two departments that share a semester', async () => {
    const cse = await createStudent({ mentorId: mentor.id, departmentCode: 'CSE', semester: 3 });
    await createStudent({ mentorId: mentor.id, departmentCode: 'ECE', semester: 3 });
    const subject = await createSubject({ departmentCode: 'CSE', semester: 3 });

    const res = await request(app).get('/api/scores/class').set(authHeader(mentor))
      .query({ department: 'CSE', semester: 3, academicYear: 2026, subjectId: subject.id });

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].studentId).toBe(cse.student.id);
  });

  it('accepts a department code in any casing', async () => {
    await createStudent({ mentorId: mentor.id, departmentCode: 'CSE', semester: 3 });
    const subject = await createSubject({ departmentCode: 'CSE', semester: 3 });

    const res = await request(app).get('/api/scores/class').set(authHeader(mentor))
      .query({ department: 'cse', semester: 3, academicYear: 2026, subjectId: subject.id });

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
  });

  it('404s for a department that does not exist', async () => {
    const subject = await createSubject({ departmentCode: 'CSE', semester: 3 });

    const res = await request(app).get('/api/scores/class').set(authHeader(mentor))
      .query({ department: 'NOPE', semester: 3, academicYear: 2026, subjectId: subject.id });

    expect(res.status).toBe(404);
  });

  it('scopes the attendance grid the same way', async () => {
    await createStudent({ mentorId: mentor.id, departmentCode: 'CSE', semester: 3 });
    await createStudent({ mentorId: mentor.id, departmentCode: 'ECE', semester: 3 });
    const subject = await createSubject({ departmentCode: 'CSE', semester: 3 });

    const res = await request(app).get('/api/attendance/class').set(authHeader(mentor))
      .query({ department: 'CSE', semester: 3, academicYear: 2026, subjectId: subject.id });

    expect(res.body.rows).toHaveLength(1);
  });

  it('scopes the marks sheet export the same way', async () => {
    await createStudent({ mentorId: mentor.id, departmentCode: 'CSE', semester: 3 });
    await createStudent({ mentorId: mentor.id, departmentCode: 'ECE', semester: 3 });
    const subject = await createSubject({ departmentCode: 'CSE', semester: 3 });

    const res = await request(app).get('/api/reports/marks-sheet.xlsx').set(authHeader(mentor))
      .query({ department: 'CSE', semester: 3, academicYear: 2026, subjectId: subject.id })
      .responseType('blob');

    expect(res.status).toBe(200);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    const rows = [];
    workbook.getWorksheet('Marks').eachRow((row, number) => {
      if (number > 6 && typeof row.getCell(2).value === 'string' && row.getCell(2).value.startsWith('Student')) {
        rows.push(row.getCell(1).value);
      }
    });

    expect(rows).toHaveLength(1);
  });
});
