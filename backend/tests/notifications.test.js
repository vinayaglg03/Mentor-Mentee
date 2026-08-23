import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { setMailer, resetMailer } from '../src/lib/mailer.js';
import { buildMentorDigest, buildHodDigest, sendMentorDigests, sendHodDigests } from '../src/lib/digests.js';
import {
  prisma, resetDatabase, createUser, createStudent, createSubject, createDepartment,
  createHod, authHeader,
} from './helpers.js';

let mentor, hod, subject, sent;

const dayMs = 24 * 60 * 60 * 1000;

// A driver that records instead of sending, so the tests assert on content.
const recordingMailer = () => {
  const messages = [];
  setMailer({
    name: 'test',
    async send(message) {
      messages.push(message);
      return { accepted: [message.to], driver: 'test' };
    },
  });
  return messages;
};

beforeEach(async () => {
  await resetDatabase();
  await createDepartment({ code: 'CSE' });
  hod = await createHod({ departmentCode: 'CSE' });
  mentor = await createUser({ role: 'MENTOR', departmentCode: 'CSE', maxStudents: 100 });
  subject = await createSubject({ departmentCode: 'CSE', semester: 3 });
  sent = recordingMailer();
});

afterAll(async () => {
  resetMailer();
  await prisma.$disconnect();
});

const alertFor = (semesterRecordId, { severity = 'HIGH', ageDays = 0, message = 'Attendance is 62.5% (below 75%).' } = {}) =>
  prisma.alert.create({
    data: {
      semesterRecordId,
      type: 'LOW_ATTENDANCE',
      severity,
      message,
      timestamp: new Date(Date.now() - ageDays * dayMs),
    },
  });

describe('the mentor digest', () => {
  it('gathers alerts, quiet students and follow-ups', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    await alertFor(student.semesterRecord.id);

    await prisma.progressLog.create({
      data: {
        semesterRecordId: student.semesterRecord.id,
        mentorId: mentor.id,
        remark: 'Agreed a catch-up plan',
        actionItems: 'Bring the lab record',
        followUpDate: new Date(Date.now() + 2 * dayMs),
      },
    });

    const digest = await buildMentorDigest(mentor.id);

    expect(digest.alerts).toHaveLength(1);
    expect(digest.alerts[0].high).toHaveLength(1);
    expect(digest.followUps).toHaveLength(1);
    expect(digest.isEmpty).toBe(false);
  });

  it('flags a student nobody has logged an interaction with for 30+ days', async () => {
    const quiet = await createStudent({ mentorId: mentor.id, semester: 3 });
    const recent = await createStudent({ mentorId: mentor.id, semester: 3 });

    await prisma.progressLog.create({
      data: {
        semesterRecordId: recent.semesterRecord.id,
        mentorId: mentor.id,
        remark: 'Spoke yesterday',
        date: new Date(Date.now() - dayMs),
      },
    });

    const digest = await buildMentorDigest(mentor.id);

    expect(digest.quiet.map(row => row.student.id)).toEqual([quiet.student.id]);
  });

  it('sends one email with everything in it, not one per alert', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    await alertFor(student.semesterRecord.id);
    await alertFor(student.semesterRecord.id, { severity: 'MEDIUM', message: 'Internal total is low.' });

    const result = await sendMentorDigests({ frequency: 'DAILY' });

    expect(result.sent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(mentor.email);
    expect(sent[0].text).toContain('below 75%');
    expect(sent[0].text).toContain('Internal total is low.');
  });

  it('says nothing when there is nothing to say', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    await prisma.progressLog.create({
      data: { semesterRecordId: student.semesterRecord.id, mentorId: mentor.id, remark: 'All well', date: new Date() },
    });

    const result = await sendMentorDigests({ frequency: 'DAILY' });

    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('carries a working unsubscribe link', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    await alertFor(student.semesterRecord.id);

    await sendMentorDigests({ frequency: 'DAILY' });

    const match = sent[0].text.match(/unsubscribe\?token=([a-z0-9]+)/i);
    expect(match).not.toBeNull();

    const res = await request(app).post('/api/notifications/unsubscribe').send({ token: match[1] });

    expect(res.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: mentor.id } })).digestFrequency).toBe('OFF');
  });
});

describe('preferences are respected', () => {
  it('skips anybody set to OFF', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    await alertFor(student.semesterRecord.id);
    await prisma.user.update({ where: { id: mentor.id }, data: { digestFrequency: 'OFF' } });

    const result = await sendMentorDigests({ frequency: 'DAILY' });

    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('holds a weekly subscriber back from the daily run', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    await alertFor(student.semesterRecord.id);
    await prisma.user.update({ where: { id: mentor.id }, data: { digestFrequency: 'WEEKLY' } });

    expect((await sendMentorDigests({ frequency: 'DAILY' })).sent).toBe(0);
    expect((await sendMentorDigests({ frequency: 'WEEKLY' })).sent).toBe(1);
  });

  it('lets a user read and change their own setting', async () => {
    const read = await request(app).get('/api/notifications/preferences').set(authHeader(mentor));

    expect(read.status).toBe(200);
    expect(read.body.digestFrequency).toBe('DAILY');
    expect(read.body.unsubscribeUrl).toContain('token=');

    const write = await request(app).put('/api/notifications/preferences')
      .set(authHeader(mentor)).send({ digestFrequency: 'WEEKLY' });

    expect(write.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: mentor.id } })).digestFrequency).toBe('WEEKLY');
  });

  it('rejects a frequency it does not recognise, and a bad unsubscribe token', async () => {
    const bad = await request(app).put('/api/notifications/preferences')
      .set(authHeader(mentor)).send({ digestFrequency: 'HOURLY' });
    expect(bad.status).toBe(400);

    const wrongToken = await request(app).post('/api/notifications/unsubscribe')
      .send({ token: 'a'.repeat(32) });
    expect(wrongToken.status).toBe(404);
  });
});

describe('the HOD escalation', () => {
  it('includes a HIGH alert nobody has closed after seven days', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    await alertFor(student.semesterRecord.id, { ageDays: 10 });

    const department = await prisma.department.findUnique({ where: { code: 'CSE' } });
    const digest = await buildHodDigest([department.id]);

    expect(digest.escalated).toHaveLength(1);
    expect(digest.escalated[0].ageDays).toBeGreaterThanOrEqual(7);
    expect(digest.escalated[0].mentor.name).toBe(mentor.name);
  });

  it('leaves a fresh alert, a resolved one and a medium one alone', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    await alertFor(student.semesterRecord.id, { ageDays: 1 });
    await alertFor(student.semesterRecord.id, { ageDays: 30, severity: 'MEDIUM' });
    const resolved = await alertFor(student.semesterRecord.id, { ageDays: 30, message: 'Old but handled' });
    await prisma.alert.update({ where: { id: resolved.id }, data: { resolved: true } });

    const department = await prisma.department.findUnique({ where: { code: 'CSE' } });
    const digest = await buildHodDigest([department.id]);

    expect(digest.escalated).toHaveLength(0);
    expect(digest.isEmpty).toBe(true);
  });

  it('emails the HOD their own department only', async () => {
    await createDepartment({ code: 'ECE' });
    const eceHod = await createHod({ departmentCode: 'ECE' });
    const eceMentor = await createUser({ role: 'MENTOR', departmentCode: 'ECE' });

    const cseStudent = await createStudent({ mentorId: mentor.id, departmentCode: 'CSE', semester: 3 });
    const eceStudent = await createStudent({ mentorId: eceMentor.id, departmentCode: 'ECE', semester: 3 });

    await alertFor(cseStudent.semesterRecord.id, { ageDays: 10, message: 'CSE problem' });
    await alertFor(eceStudent.semesterRecord.id, { ageDays: 10, message: 'ECE problem' });

    await sendHodDigests();

    const toCse = sent.find(message => message.to === hod.email);
    const toEce = sent.find(message => message.to === eceHod.email);

    expect(toCse.text).toContain('CSE problem');
    expect(toCse.text).not.toContain('ECE problem');
    expect(toEce.text).toContain('ECE problem');
    expect(toEce.text).not.toContain('CSE problem');
  });
});

describe('failures do not take the run down', () => {
  it('carries on when the provider rejects a message', async () => {
    setMailer({
      name: 'broken',
      async send() { throw new Error('SMTP is down'); },
    });

    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    await alertFor(student.semesterRecord.id);

    await expect(sendMentorDigests({ frequency: 'DAILY' })).resolves.toMatchObject({ sent: 1 });
  });
});

describe('the scheduler', () => {
  it('registers every scheduled job and can be turned off', async () => {
    vi.resetModules();
    const { startScheduler, stopScheduler } = await import('../src/jobs/scheduler.js');

    const tasks = startScheduler();
    expect(tasks.map(task => task.name)).toEqual([
      'daily-digest',
      'weekly-digest',
      'inactivity-check',
      // Added with the Settings page: mentors who asked to hear about
      // high-severity alerts get them batched hourly.
      'high-severity-alerts',
    ]);
    stopScheduler();
  });
});
