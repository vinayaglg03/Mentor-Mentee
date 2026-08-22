import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import app from '../src/app.js';
import { prisma, resetDatabase, createUser, createStudent, createSubject, authHeader, createHod } from './helpers.js';
import { DEFAULT_BANDS } from '../src/lib/gpa.js';

let mentor, other, admin, subject;

beforeEach(async () => {
  await resetDatabase();
  await prisma.gradeBand.createMany({ data: DEFAULT_BANDS });
  mentor = await createUser({ role: 'MENTOR', maxStudents: 100 });
  other = await createUser({ role: 'MENTOR' });
  admin = await createHod();
  subject = await createSubject({ semester: 3 });
});

afterAll(() => prisma.$disconnect());

// A student with marks, attendance, an achievement, a log and an alert.
const populate = async (mentorUser, { exam = 45 } = {}) => {
  const student = await createStudent({ mentorId: mentorUser.id, semester: 3 });

  await request(app).post('/api/scores').set(authHeader(mentorUser)).send({
    studentId: student.student.id,
    subjectId: subject.id,
    semester: 3,
    academicYear: 2026,
    test1: 20, test2: 22, assignment: 24, exam,
  });

  await request(app).post('/api/attendance/bulk').set(authHeader(mentorUser)).send({
    subjectId: subject.id,
    semester: 3,
    academicYear: 2026,
    rows: [{ studentId: student.student.id, classesHeld: 48, classesAttended: 30 }],
  });

  await request(app).post('/api/mentors/logs').set(authHeader(mentorUser)).send({
    studentId: student.student.id,
    semesterRecordId: student.semesterRecord.id,
    remark: 'Discussed attendance shortfall and agreed a catch-up plan.',
  });

  await request(app).post('/api/mentors/achievements').set(authHeader(mentorUser)).send({
    studentId: student.student.id,
    semesterRecordId: student.semesterRecord.id,
    title: 'Runner-up, state hackathon',
  });

  return student;
};

const readWorkbook = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
};

describe('mentoring report (PDF)', () => {
  it('produces a PDF for the mentor\'s own student', async () => {
    const student = await populate(mentor);

    const res = await request(app)
      .get(`/api/reports/student/${student.student.id}/mentoring.pdf`)
      .set(authHeader(mentor))
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('mentoring-report-');
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
    // A report with marks, attendance, a log and an achievement is not a stub.
    expect(res.body.length).toBeGreaterThan(3000);
  });

  it('works for a student with no data at all', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });

    const res = await request(app)
      .get(`/api/reports/student/${student.student.id}/mentoring.pdf`)
      .set(authHeader(mentor))
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('grows with the record it describes', async () => {
    const empty = await createStudent({ mentorId: mentor.id, semester: 3 });
    const populated = await populate(mentor);

    const fetch = (id) => request(app)
      .get(`/api/reports/student/${id}/mentoring.pdf`)
      .set(authHeader(mentor))
      .responseType('blob');

    const [emptyReport, fullReport] = await Promise.all([
      fetch(empty.student.id),
      fetch(populated.student.id),
    ]);

    // Marks, attendance, the chart, an achievement and a log all land on the
    // page rather than the template rendering empty.
    expect(fullReport.body.length).toBeGreaterThan(emptyReport.body.length + 1000);
  });

  it("refuses another mentor's student", async () => {
    const theirs = await createStudent({ mentorId: other.id, semester: 3 });

    const res = await request(app)
      .get(`/api/reports/student/${theirs.student.id}/mentoring.pdf`)
      .set(authHeader(mentor));

    expect(res.status).toBe(403);
  });

  it('lets an admin export any student', async () => {
    const theirs = await createStudent({ mentorId: other.id, semester: 3 });

    const res = await request(app)
      .get(`/api/reports/student/${theirs.student.id}/mentoring.pdf`)
      .set(authHeader(admin))
      .responseType('blob');

    expect(res.status).toBe(200);
  });
});

describe('class summary (PDF)', () => {
  it('produces a PDF for an admin', async () => {
    await populate(mentor);

    const res = await request(app)
      .get('/api/reports/class-summary.pdf')
      .set(authHeader(admin))
      .query({ department: 'CSE', semester: 3, academicYear: 2026 })
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('rejects a request without the class filters', async () => {
    const res = await request(app).get('/api/reports/class-summary.pdf').set(authHeader(admin));
    expect(res.status).toBe(400);
  });
});

describe('at-risk export (Excel)', () => {
  it('lists only the requesting mentor\'s students', async () => {
    const mine = await populate(mentor);
    await populate(other);

    const res = await request(app)
      .get('/api/reports/at-risk.xlsx')
      .set(authHeader(mentor))
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');

    const sheet = (await readWorkbook(res.body)).getWorksheet('At risk');
    const rolls = [];
    sheet.eachRow((row, number) => {
      if (number > 6) rolls.push(row.getCell(1).value);
    });

    expect(rolls).toEqual([mine.student.rollNumber]);
  });

  it('carries attendance, CGPA and the alert detail', async () => {
    const student = await populate(mentor);

    const res = await request(app)
      .get('/api/reports/at-risk.xlsx')
      .set(authHeader(mentor))
      .responseType('blob');

    const sheet = (await readWorkbook(res.body)).getWorksheet('At risk');
    const row = sheet.getRow(7);

    expect(row.getCell(1).value).toBe(student.student.rollNumber);
    expect(row.getCell(6).value).toBe(62.5);          // attendance %
    expect(row.getCell(7).value).toBeGreaterThan(0);  // CGPA
    expect(String(row.getCell(9).value)).toContain('Attendance');
  });

  it('shows an admin every at-risk student', async () => {
    await populate(mentor);
    await populate(other);

    const res = await request(app)
      .get('/api/reports/at-risk.xlsx')
      .set(authHeader(admin))
      .responseType('blob');

    const sheet = (await readWorkbook(res.body)).getWorksheet('At risk');
    let count = 0;
    sheet.eachRow((row, number) => { if (number > 6) count++; });

    expect(count).toBe(2);
  });
});

describe('marks sheet export (Excel)', () => {
  it('exports the class grid with statistics', async () => {
    await populate(mentor, { exam: 45 });
    await populate(mentor, { exam: 10 });

    const res = await request(app)
      .get('/api/reports/marks-sheet.xlsx')
      .set(authHeader(mentor))
      .query({ department: 'CSE', semester: 3, academicYear: 2026, subjectId: subject.id })
      .responseType('blob');

    expect(res.status).toBe(200);

    const sheet = (await readWorkbook(res.body)).getWorksheet('Marks');
    const results = [];
    sheet.eachRow((row, number) => {
      if (number > 6 && row.getCell(9).value) results.push(row.getCell(9).value);
    });

    // internal 45 + 45 = 90 passes; internal 45 + 10 = 55 also passes,
    // so both rows carry a result and the statistics block follows.
    expect(results).toContain('PASS');

    const labels = [];
    sheet.eachRow(row => labels.push(row.getCell(1).value));
    expect(labels).toContain('Class average');
    expect(labels).toContain('Failed');
  });

  it("excludes another mentor's students", async () => {
    await populate(mentor);
    await populate(other);

    const res = await request(app)
      .get('/api/reports/marks-sheet.xlsx')
      .set(authHeader(mentor))
      .query({ department: 'CSE', semester: 3, academicYear: 2026, subjectId: subject.id })
      .responseType('blob');

    const sheet = (await readWorkbook(res.body)).getWorksheet('Marks');
    let students = 0;
    sheet.eachRow((row, number) => {
      if (number > 6 && typeof row.getCell(2).value === 'string' && row.getCell(2).value.startsWith('Student')) students++;
    });

    expect(students).toBe(1);
  });

  it('404s for an unknown subject', async () => {
    const res = await request(app)
      .get('/api/reports/marks-sheet.xlsx')
      .set(authHeader(mentor))
      .query({ department: 'CSE', semester: 3, academicYear: 2026, subjectId: '00000000-0000-4000-8000-000000000000' });

    expect(res.status).toBe(404);
  });
});
