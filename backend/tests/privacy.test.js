import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { unauditedPrisma } from '../src/prismaClient.js';
import { setMailer, resetMailer } from '../src/lib/mailer.js';
import config from '../src/config.js';
import { retentionReport, runRetention } from '../src/jobs/retention.js';
import {
  prisma, resetDatabase, createUser, createStudent, createSubject, createDepartment,
  createHod, createSuperAdmin, authHeader,
} from './helpers.js';

let mentor, other, hod, superAdmin, subject, sent;

beforeEach(async () => {
  await resetDatabase();
  await createDepartment({ code: 'CSE' });
  hod = await createHod({ departmentCode: 'CSE' });
  superAdmin = await createSuperAdmin();
  mentor = await createUser({ role: 'MENTOR', departmentCode: 'CSE', maxStudents: 100 });
  other = await createUser({ role: 'MENTOR', departmentCode: 'CSE' });
  subject = await createSubject({ departmentCode: 'CSE', semester: 3 });

  sent = [];
  setMailer({
    name: 'test',
    async send(message) { sent.push(message); return { accepted: [message.to], driver: 'test' }; },
  });
});

afterAll(async () => {
  resetMailer();
  await prisma.$disconnect();
});

// A student with something in every category the export promises.
const populate = async () => {
  const student = await createStudent({ mentorId: mentor.id, semester: 3 });

  await request(app).post('/api/scores').set(authHeader(mentor)).send({
    studentId: student.student.id,
    subjectId: subject.id,
    semester: 3,
    academicYear: 2026,
    test1: 20, test2: 20, assignment: 20, exam: 15,
  });

  await request(app).post('/api/attendance/bulk').set(authHeader(mentor)).send({
    subjectId: subject.id,
    semester: 3,
    academicYear: 2026,
    rows: [{ studentId: student.student.id, classesHeld: 40, classesAttended: 25 }],
  });

  await request(app).post('/api/mentors/logs').set(authHeader(mentor)).send({
    studentId: student.student.id,
    semesterRecordId: student.semesterRecord.id,
    remark: 'Discussed the attendance shortfall.',
    type: 'ATTENDANCE',
    actionItems: 'Attend every lab this month',
  });

  await request(app).post('/api/mentors/achievements').set(authHeader(mentor)).send({
    studentId: student.student.id,
    semesterRecordId: student.semesterRecord.id,
    title: 'Runner-up, state hackathon',
  });

  return student;
};

describe('data export', () => {
  it('returns everything held about one student', async () => {
    const student = await populate();

    const res = await request(app)
      .get(`/api/privacy/students/${student.student.id}/export`)
      .set(authHeader(mentor));

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('amis-export-');

    const data = JSON.parse(res.text);

    expect(data.student).toMatchObject({ rollNumber: student.student.rollNumber });
    expect(data.student.department.code).toBe('CSE');
    expect(data.semesters).toHaveLength(1);
    expect(data.semesters[0].marks).toHaveLength(1);
    expect(data.semesters[0].attendance).toHaveLength(1);
    expect(data.semesters[0].mentoringLogs[0]).toMatchObject({
      remark: 'Discussed the attendance shortfall.',
      actionItems: 'Attend every lab this month',
    });
    expect(data.semesters[0].achievements).toHaveLength(1);
    expect(data.semesters[0].alerts.length).toBeGreaterThan(0);
    // The change history is part of what is held about them.
    expect(data.changeHistory.length).toBeGreaterThan(0);
    expect(data.exportedBy.id).toBe(mentor.id);
  });

  it("refuses another mentor's student and allows their HOD", async () => {
    const theirs = await createStudent({ mentorId: other.id });

    expect((await request(app)
      .get(`/api/privacy/students/${theirs.student.id}/export`)
      .set(authHeader(mentor))).status).toBe(403);

    expect((await request(app)
      .get(`/api/privacy/students/${theirs.student.id}/export`)
      .set(authHeader(hod))).status).toBe(200);
  });
});

describe('erasure', () => {
  it('removes the student and everything attached, leaving a tombstone', async () => {
    const student = await populate();
    const recordId = student.semesterRecord.id;

    const res = await request(app)
      .delete(`/api/privacy/students/${student.student.id}`)
      .set(authHeader(hod))
      .send({ confirmRollNumber: student.student.rollNumber });

    expect(res.status).toBe(200);
    expect(res.body.removed).toMatchObject({ semesters: 1 });

    expect(await prisma.student.findUnique({ where: { id: student.student.id } })).toBeNull();
    expect(await prisma.semesterRecord.count({ where: { id: recordId } })).toBe(0);
    expect(await prisma.score.count({ where: { semesterRecordId: recordId } })).toBe(0);
    expect(await prisma.attendance.count({ where: { semesterRecordId: recordId } })).toBe(0);
    expect(await prisma.progressLog.count({ where: { semesterRecordId: recordId } })).toBe(0);
    expect(await prisma.alert.count({ where: { semesterRecordId: recordId } })).toBe(0);

    // What remains says a deletion happened, and nothing about who it was.
    const tombstone = await unauditedPrisma.auditLog.findFirst({
      where: { action: 'Student.erase', entityId: student.student.id },
    });

    expect(tombstone).not.toBeNull();
    expect(tombstone.actorId).toBe(hod.id);
    expect(JSON.stringify(tombstone.after)).not.toContain(student.student.rollNumber);
    expect(JSON.stringify(tombstone.after)).not.toContain(student.student.name);
  });

  it('is a different thing from the soft delete, which keeps the record', async () => {
    const student = await createStudent({ mentorId: mentor.id });

    await request(app).delete(`/api/students/${student.student.id}`).set(authHeader(hod));

    const after = await prisma.student.findUnique({ where: { id: student.student.id } });
    expect(after.status).toBe('DROPPED');
    expect(after).not.toBeNull();
  });

  it('will not erase without the roll number typed as confirmation', async () => {
    const student = await createStudent({ mentorId: mentor.id });

    const wrong = await request(app)
      .delete(`/api/privacy/students/${student.student.id}`)
      .set(authHeader(hod))
      .send({ confirmRollNumber: 'NOT-THE-ROLL-NUMBER' });

    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toContain(student.student.rollNumber);
    expect(await prisma.student.findUnique({ where: { id: student.student.id } })).not.toBeNull();

    const missing = await request(app)
      .delete(`/api/privacy/students/${student.student.id}`)
      .set(authHeader(hod))
      .send({});

    expect(missing.status).toBe(400);
  });

  it('refuses a mentor and a coordinator', async () => {
    const student = await createStudent({ mentorId: mentor.id });
    const coordinator = await createUser({ role: 'COORDINATOR', departmentCode: 'CSE' });

    for (const user of [mentor, coordinator]) {
      const res = await request(app)
        .delete(`/api/privacy/students/${student.student.id}`)
        .set(authHeader(user))
        .send({ confirmRollNumber: student.student.rollNumber });

      expect(res.status).toBe(403);
    }

    expect(await prisma.student.findUnique({ where: { id: student.student.id } })).not.toBeNull();
  });

  it("refuses a HOD from another department", async () => {
    await createDepartment({ code: 'ECE' });
    const eceHod = await createHod({ departmentCode: 'ECE' });
    const student = await createStudent({ mentorId: mentor.id, departmentCode: 'CSE' });

    const res = await request(app)
      .delete(`/api/privacy/students/${student.student.id}`)
      .set(authHeader(eceHod))
      .send({ confirmRollNumber: student.student.rollNumber });

    expect(res.status).toBe(403);
    expect(await prisma.student.findUnique({ where: { id: student.student.id } })).not.toBeNull();
  });
});

describe('retention', () => {
  it('publishes what this deployment is actually set to', async () => {
    const res = await request(app).get('/api/privacy/retention');

    expect(res.status).toBe(200);
    expect(res.body.auditYears).toBe(config.retention.auditYears);
    expect(res.body.graduatedStudentYears).toBe(config.retention.graduatedStudentYears);
    expect(res.body.refreshTokenDays).toBe(config.auth.refreshTokenDays);
  });

  it('reports what is past its window without deleting anything', async () => {
    const student = await createStudent({ mentorId: mentor.id, status: 'GRADUATED' });
    await prisma.$executeRawUnsafe(
      `UPDATE "Student" SET "updatedAt" = NOW() - INTERVAL '9 years' WHERE id = '${student.student.id}'`
    );

    const report = await retentionReport();

    expect(report.pastRetention.graduatedStudents).toBe(1);
    expect(await prisma.student.count()).toBe(1);
  });

  it('prunes sessions and abandoned imports, never student records', async () => {
    const student = await createStudent({ mentorId: mentor.id, status: 'GRADUATED' });
    await prisma.$executeRawUnsafe(
      `UPDATE "Student" SET "updatedAt" = NOW() - INTERVAL '9 years' WHERE id = '${student.student.id}'`
    );

    await prisma.refreshToken.create({
      data: {
        userId: mentor.id,
        tokenHash: 'expired-hash-for-the-test',
        family: 'test-family',
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await prisma.pendingImport.create({
      data: {
        type: 'students',
        userId: mentor.id,
        fileName: 'abandoned.xlsx',
        summary: {},
        rows: [],
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const result = await runRetention({ includeAudit: false });

    expect(result.removed.expiredTokens).toBe(1);
    expect(result.removed.stalePendingImports).toBe(1);
    // The student who is past the window is reported, not deleted.
    expect(await prisma.student.count()).toBe(1);
  });
});

describe('report a problem', () => {
  it('captures the page, the request reference and the browser', async () => {
    const original = config.support.email;
    config.support.email = 'support@example.edu';

    try {
      const res = await request(app).post('/api/privacy/report-problem')
        .set(authHeader(mentor))
        .set('User-Agent', 'Firefox/140.0')
        .send({
          message: 'Saving marks for semester 3 did nothing.',
          route: '/marks/entry?department=CSE',
          requestId: 'abc-123',
          viewport: '390x844',
        });

      expect(res.status).toBe(200);
      expect(res.body.emailed).toBe(true);

      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('support@example.edu');
      expect(sent[0].text).toContain('Saving marks for semester 3 did nothing.');
      expect(sent[0].text).toContain('/marks/entry?department=CSE');
      expect(sent[0].text).toContain('abc-123');
      expect(sent[0].text).toContain('390x844');
      expect(sent[0].subject).toContain(mentor.email);
    } finally {
      config.support.email = original;
    }
  });

  it('still records the report when no support address is configured', async () => {
    const original = config.support.email;
    config.support.email = '';

    try {
      const res = await request(app).post('/api/privacy/report-problem')
        .set(authHeader(mentor))
        .send({ message: 'Something went wrong on the dashboard.' });

      expect(res.status).toBe(200);
      expect(res.body.emailed).toBe(false);
      expect(res.body.requestId).toBeTruthy();
      expect(sent).toHaveLength(0);
    } finally {
      config.support.email = original;
    }
  });

  it('rejects an empty report', async () => {
    const res = await request(app).post('/api/privacy/report-problem')
      .set(authHeader(mentor)).send({ message: 'no' });

    expect(res.status).toBe(400);
  });
});

describe('changelog', () => {
  it('serves the release notes the app shows', async () => {
    const res = await request(app).get('/api/privacy/changelog');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('markdown');
    expect(res.text).toContain('# Changelog');
  });
});
