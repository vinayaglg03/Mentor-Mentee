import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { unauditedPrisma } from '../src/prismaClient.js';
import {
  prisma, resetDatabase, createUser, createStudent, createDepartment, createHod, authHeader,
} from './helpers.js';

let mentor, other, hod, student;

const dayMs = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await resetDatabase();
  await createDepartment({ code: 'CSE' });
  hod = await createHod({ departmentCode: 'CSE' });
  mentor = await createUser({ role: 'MENTOR', departmentCode: 'CSE', maxStudents: 100 });
  other = await createUser({ role: 'MENTOR', departmentCode: 'CSE' });
  student = await createStudent({ mentorId: mentor.id, semester: 3 });
});

afterAll(() => prisma.$disconnect());

const addLog = (user, body) =>
  request(app).post('/api/mentors/logs').set(authHeader(user)).send({
    studentId: student.student.id,
    semesterRecordId: student.semesterRecord.id,
    ...body,
  });

const ageLog = (id, days) =>
  unauditedPrisma.$executeRawUnsafe(
    `UPDATE "ProgressLog" SET "createdAt" = NOW() - INTERVAL '${days} days' WHERE id = '${id}'`
  );

describe('richer mentoring records', () => {
  it('stores the type, mode, actions and follow-up date', async () => {
    const res = await addLog(mentor, {
      remark: 'Discussed the attendance shortfall.',
      type: 'ATTENDANCE',
      mode: 'PHONE',
      actionItems: 'Attend every lab this month; review on the 30th.',
      followUpDate: '2026-09-30',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'ATTENDANCE',
      mode: 'PHONE',
      actionItems: 'Attend every lab this month; review on the 30th.',
      studentAcknowledged: false,
    });
    expect(new Date(res.body.followUpDate).toISOString()).toContain('2026-09-30');
  });

  it('defaults to a routine in-person meeting', async () => {
    const res = await addLog(mentor, { remark: 'Checked in.' });

    expect(res.body.type).toBe('ROUTINE_MEETING');
    expect(res.body.mode).toBe('IN_PERSON');
    expect(res.body.followUpDate).toBeNull();
  });

  it('rejects a type or mode it does not recognise', async () => {
    expect((await addLog(mentor, { remark: 'x', type: 'GOSSIP' })).status).toBe(400);
    expect((await addLog(mentor, { remark: 'x', mode: 'TELEPATHY' })).status).toBe(400);
  });

  it('records that the student acknowledged the entry', async () => {
    const created = await addLog(mentor, { remark: 'Signed off with the student.' });

    const res = await request(app).put(`/api/mentors/logs/${created.body.id}`)
      .set(authHeader(mentor)).send({ studentAcknowledged: true });

    expect(res.status).toBe(200);
    expect(res.body.studentAcknowledged).toBe(true);
  });
});

describe('the 24-hour edit window', () => {
  it('lets the author fix their own wording straight away', async () => {
    const created = await addLog(mentor, { remark: 'Typo here' });

    const res = await request(app).put(`/api/mentors/logs/${created.body.id}`)
      .set(authHeader(mentor)).send({ remark: 'Corrected wording' });

    expect(res.status).toBe(200);
    expect(res.body.remark).toBe('Corrected wording');
  });

  it('closes after 24 hours and points at making a correction instead', async () => {
    const created = await addLog(mentor, { remark: 'Original entry' });
    await ageLog(created.body.id, 2);

    const res = await request(app).put(`/api/mentors/logs/${created.body.id}`)
      .set(authHeader(mentor)).send({ remark: 'Rewriting history' });

    expect(res.status).toBe(409);
    expect(res.body.correctsId).toBe(created.body.id);

    const unchanged = await prisma.progressLog.findUnique({ where: { id: created.body.id } });
    expect(unchanged.remark).toBe('Original entry');
  });

  it('refuses somebody else editing an entry even inside the window', async () => {
    const created = await addLog(mentor, { remark: 'Mine' });

    for (const user of [other, hod]) {
      const res = await request(app).put(`/api/mentors/logs/${created.body.id}`)
        .set(authHeader(user)).send({ remark: 'Not yours' });

      expect(res.status).toBe(403);
    }
  });

  it('keeps the original when a correction is added', async () => {
    const original = await addLog(mentor, { remark: 'Said 65%' });
    await ageLog(original.body.id, 3);

    const correction = await addLog(mentor, {
      remark: 'Correction: attendance was 56%, not 65%.',
      correctsId: original.body.id,
    });

    expect(correction.status).toBe(201);
    expect(correction.body.correctsId).toBe(original.body.id);

    const logs = await prisma.progressLog.findMany({ orderBy: { createdAt: 'asc' } });
    expect(logs).toHaveLength(2);
    expect(logs[0].remark).toBe('Said 65%');
  });

  it('will not attach a correction to another student\'s entry', async () => {
    const otherStudent = await createStudent({ mentorId: mentor.id, semester: 3 });
    const theirLog = await request(app).post('/api/mentors/logs').set(authHeader(mentor)).send({
      studentId: otherStudent.student.id,
      semesterRecordId: otherStudent.semesterRecord.id,
      remark: 'Different student',
    });

    const res = await addLog(mentor, { remark: 'Wrong target', correctsId: theirLog.body.id });

    expect(res.status).toBe(400);
  });

  it('leaves an audit trail for an edit', async () => {
    const created = await addLog(mentor, { remark: 'Before' });
    await request(app).put(`/api/mentors/logs/${created.body.id}`)
      .set(authHeader(mentor)).send({ remark: 'After' });

    const entries = await unauditedPrisma.auditLog.findMany({
      where: { entityType: 'ProgressLog', entityId: created.body.id },
    });

    const edit = entries.find(entry => entry.after?.remark?.from);
    expect(edit.actorId).toBe(mentor.id);
    expect(edit.after.remark).toEqual({ from: 'Before', to: 'After' });
  });
});

describe('follow-ups due', () => {
  it('lists overdue and upcoming follow-ups for the mentor', async () => {
    await addLog(mentor, {
      remark: 'Overdue one',
      actionItems: 'Bring the lab record',
      followUpDate: new Date(Date.now() - 3 * dayMs).toISOString(),
    });
    await addLog(mentor, {
      remark: 'Due soon',
      followUpDate: new Date(Date.now() + 3 * dayMs).toISOString(),
    });
    await addLog(mentor, {
      remark: 'Far away',
      followUpDate: new Date(Date.now() + 60 * dayMs).toISOString(),
    });
    await addLog(mentor, { remark: 'No follow-up set' });

    const res = await request(app).get('/api/mentors/follow-ups').set(authHeader(mentor));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ overdue: true, actionItems: 'Bring the lab record' });
    expect(res.body[1].overdue).toBe(false);
    expect(res.body[0].student.rollNumber).toBe(student.student.rollNumber);
  });

  it('shows each mentor only their own', async () => {
    await addLog(mentor, { remark: 'Mine', followUpDate: new Date(Date.now() + dayMs).toISOString() });

    const res = await request(app).get('/api/mentors/follow-ups').set(authHeader(other));
    expect(res.body).toHaveLength(0);
  });

  it('drops follow-ups for students who have left', async () => {
    await addLog(mentor, { remark: 'Mine', followUpDate: new Date(Date.now() + dayMs).toISOString() });
    await prisma.student.update({ where: { id: student.student.id }, data: { status: 'DROPPED' } });

    const res = await request(app).get('/api/mentors/follow-ups').set(authHeader(mentor));
    expect(res.body).toHaveLength(0);
  });
});

describe('the report carries the new fields', () => {
  it('grows when the log has a type, actions and a follow-up', async () => {
    const bare = await createStudent({ mentorId: mentor.id, semester: 3 });
    await request(app).post('/api/mentors/logs').set(authHeader(mentor)).send({
      studentId: bare.student.id,
      semesterRecordId: bare.semesterRecord.id,
      remark: 'Short note',
    });

    await addLog(mentor, {
      remark: 'Discussed the attendance shortfall in detail.',
      type: 'ATTENDANCE',
      mode: 'PHONE',
      actionItems: 'Attend every lab this month and report back with the record book.',
      followUpDate: new Date(Date.now() + 20 * dayMs).toISOString(),
    });

    const fetchReport = (id) => request(app)
      .get(`/api/reports/student/${id}/mentoring.pdf`)
      .set(authHeader(mentor))
      .responseType('blob');

    const [plain, detailed] = await Promise.all([
      fetchReport(bare.student.id),
      fetchReport(student.student.id),
    ]);

    expect(detailed.status).toBe(200);
    expect(detailed.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(detailed.body.length).toBeGreaterThan(plain.body.length);
  });
});
