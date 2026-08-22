import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
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

const bulk = (user, body) =>
  request(app).post('/api/attendance/bulk').set(authHeader(user)).send(body);

const alertsFor = (studentId) =>
  prisma.alert.findMany({
    where: { semesterRecord: { studentId }, type: 'LOW_ATTENDANCE' },
    select: { severity: true, message: true, resolved: true },
  });

describe('POST /api/attendance/bulk', () => {
  it('stores attendance and reports the percentage', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });

    const res = await bulk(mentor, {
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: student.student.id, classesHeld: 48, classesAttended: 44 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.results[0].percent).toBe(91.7);

    const stored = await prisma.attendance.findFirst();
    expect(stored).toMatchObject({ classesHeld: 48, classesAttended: 44 });
  });

  it('raises a HIGH alert below 75%', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });

    await bulk(mentor, {
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: student.student.id, classesHeld: 40, classesAttended: 25 }],
    });

    const alerts = await alertsFor(student.student.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('HIGH');
    expect(alerts[0].message).toContain('62.5%');
  });

  it('raises a MEDIUM alert between 75% and 85%', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });

    await bulk(mentor, {
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: student.student.id, classesHeld: 40, classesAttended: 32 }],
    });

    const alerts = await alertsFor(student.student.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('MEDIUM');
  });

  it('raises nothing at or above 85%', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });

    await bulk(mentor, {
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: student.student.id, classesHeld: 40, classesAttended: 34 }],
    });

    expect(await alertsFor(student.student.id)).toHaveLength(0);
  });

  it('does not duplicate an alert when the same figures are saved twice', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const body = {
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: student.student.id, classesHeld: 40, classesAttended: 25 }],
    };

    await bulk(mentor, body);
    await bulk(mentor, body);

    expect(await alertsFor(student.student.id)).toHaveLength(1);
    expect(await prisma.attendance.count()).toBe(1);
  });

  it('rejects attended greater than held and saves nothing', async () => {
    const a = await createStudent({ mentorId: mentor.id, semester: 3 });
    const b = await createStudent({ mentorId: mentor.id, semester: 3 });

    const res = await bulk(mentor, {
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [
        { studentId: a.student.id, classesHeld: 40, classesAttended: 30 },
        { studentId: b.student.id, classesHeld: 40, classesAttended: 45 },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ studentId: b.student.id });
    expect(await prisma.attendance.count()).toBe(0);
  });

  it("refuses a batch containing another mentor's student", async () => {
    const theirs = await createStudent({ mentorId: other.id, semester: 3 });

    const res = await bulk(mentor, {
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: theirs.student.id, classesHeld: 40, classesAttended: 30 }],
    });

    expect(res.status).toBe(403);
    expect(await prisma.attendance.count()).toBe(0);
  });
});

describe('attendance reads', () => {
  it('returns the class grid for one subject', async () => {
    const mine = await createStudent({ mentorId: mentor.id, semester: 3 });
    await createStudent({ mentorId: other.id, semester: 3 });

    await bulk(mentor, {
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: mine.student.id, classesHeld: 40, classesAttended: 30 }],
    });

    const res = await request(app)
      .get('/api/attendance/class')
      .set(authHeader(mentor))
      .query({ department: 'CSE', semester: 3, academicYear: 2026, subjectId: subject.id });

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({ classesHeld: 40, classesAttended: 30, percent: 75 });
  });

  it('returns a per-student breakdown with the semester aggregate', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const second = await createSubject({ semester: 3 });

    for (const [subjectId, held, attended] of [[subject.id, 40, 30], [second.id, 20, 20]]) {
      await bulk(mentor, {
        subjectId,
        semester: 3,
        academicYear: 2026,
        rows: [{ studentId: student.student.id, classesHeld: held, classesAttended: attended }],
      });
    }

    const res = await request(app)
      .get(`/api/attendance/student/${student.student.id}`)
      .set(authHeader(mentor));

    expect(res.status).toBe(200);
    const [semester] = res.body.semesters;
    // 50 attended out of 60 held across both subjects.
    expect(semester.percent).toBe(83.3);
    expect(semester.subjects).toHaveLength(2);
  });

  it("refuses another mentor's student", async () => {
    const theirs = await createStudent({ mentorId: other.id, semester: 3 });

    const res = await request(app)
      .get(`/api/attendance/student/${theirs.student.id}`)
      .set(authHeader(mentor));

    expect(res.status).toBe(403);
  });

  it('surfaces the percentage on the mentor student list and student detail', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });

    await bulk(mentor, {
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: student.student.id, classesHeld: 40, classesAttended: 30 }],
    });

    const list = await request(app).get('/api/mentors/students').set(authHeader(mentor));
    expect(list.body[0].semesterRecords[0].attendancePercent).toBe(75);

    const detail = await request(app).get(`/api/students/${student.student.id}`).set(authHeader(mentor));
    expect(detail.body.semesterRecords[0].attendancePercent).toBe(75);
  });
});

describe('attendance import', () => {
  const headers = ['Roll Number', 'Subject Code', 'Semester', 'Academic Year', 'Classes Held', 'Classes Attended'];

  const sheet = async (rows) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data');
    worksheet.addRow(headers);
    for (const row of rows) worksheet.addRow(row);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  };

  it('imports attendance and raises the same alerts as the grid', async () => {
    const viaGrid = await createStudent({ mentorId: mentor.id, semester: 3 });
    const viaImport = await createStudent({ mentorId: mentor.id, semester: 3 });
    await prisma.subject.update({ where: { id: subject.id }, data: { code: 'CS301' } });

    await bulk(mentor, {
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: viaGrid.student.id, classesHeld: 40, classesAttended: 25 }],
    });

    const file = await sheet([[viaImport.student.rollNumber, 'CS301', 3, 2026, 40, 25]]);
    const preview = await request(app)
      .post('/api/import/attendance/preview')
      .set(authHeader(mentor))
      .attach('file', file, 'attendance.xlsx');

    expect(preview.body.summary.invalid).toBe(0);
    expect(preview.body.rows[0].display.percent).toBe(62.5);

    const res = await request(app)
      .post('/api/import/attendance/commit')
      .set(authHeader(mentor))
      .send({ importId: preview.body.importId });

    expect(res.status).toBe(200);
    expect(await alertsFor(viaImport.student.id)).toEqual(await alertsFor(viaGrid.student.id));
  });

  it('rejects attended greater than held with the source row number', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    await prisma.subject.update({ where: { id: subject.id }, data: { code: 'CS301' } });

    const file = await sheet([[student.student.rollNumber, 'CS301', 3, 2026, 40, 50]]);
    const preview = await request(app)
      .post('/api/import/attendance/preview')
      .set(authHeader(mentor))
      .attach('file', file, 'attendance.xlsx');

    expect(preview.body.summary.invalid).toBe(1);
    expect(preview.body.errors[0].rowNumber).toBe(2);
    expect(preview.body.errors[0].message).toMatch(/cannot exceed/);
    expect(await prisma.attendance.count()).toBe(0);
  });
});
