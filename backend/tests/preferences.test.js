import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { setMailer, resetMailer } from '../src/lib/mailer.js';
import { runHighSeverityNotifications } from '../src/jobs/highSeverityAlerts.js';
import { getInstitutionSettings, invalidateInstitutionSettings } from '../src/lib/institutionSettings.js';
import { buildAttendanceAlerts } from '../src/lib/scoring.js';
import {
  prisma, resetDatabase, createUser, createStudent, createSubject, createDepartment,
  createHod, createSuperAdmin, authHeader,
} from './helpers.js';

let mentor, other, hod, superAdmin, department, sent;

beforeEach(async () => {
  await resetDatabase();
  invalidateInstitutionSettings();

  department = await createDepartment({ code: 'CSE' });
  hod = await createHod({ departmentCode: 'CSE' });
  superAdmin = await createSuperAdmin();
  mentor = await createUser({ role: 'MENTOR', departmentCode: 'CSE', maxStudents: 100 });
  other = await createUser({ role: 'MENTOR', departmentCode: 'CSE' });

  sent = [];
  setMailer({
    name: 'test',
    async send(message) { sent.push(message); return { accepted: [message.to], driver: 'test' }; },
  });
});

afterAll(async () => {
  resetMailer();
  invalidateInstitutionSettings();
  await prisma.$disconnect();
});

describe('personal preferences', () => {
  it('answers with defaults before anything has been chosen', async () => {
    const res = await request(app).get('/api/preferences').set(authHeader(mentor));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      theme: 'system',
      density: 'comfortable',
      defaultDepartmentId: null,
    });

    // null, not false: nobody has said anything about motion yet, so the
    // browser should keep following the operating system. Storing false here
    // would override prefers-reduced-motion for everybody who has never
    // opened Settings.
    expect(res.body.reduceMotion).toBeNull();
  });

  it('lets an explicit motion choice be made and then handed back to the system', async () => {
    await request(app).put('/api/preferences')
      .set(authHeader(mentor)).send({ reduceMotion: true });

    expect((await request(app).get('/api/preferences').set(authHeader(mentor))).body.reduceMotion)
      .toBe(true);

    await request(app).put('/api/preferences')
      .set(authHeader(mentor)).send({ reduceMotion: null });

    expect((await request(app).get('/api/preferences').set(authHeader(mentor))).body.reduceMotion)
      .toBeNull();
  });

  it('saves and returns a change', async () => {
    const res = await request(app).put('/api/preferences')
      .set(authHeader(mentor))
      .send({ theme: 'dark', density: 'compact', reduceMotion: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ theme: 'dark', density: 'compact', reduceMotion: true });

    const read = await request(app).get('/api/preferences').set(authHeader(mentor));
    expect(read.body).toMatchObject({ theme: 'dark', density: 'compact', reduceMotion: true });
  });

  it('keeps one person out of another person\'s settings', async () => {
    await request(app).put('/api/preferences').set(authHeader(mentor)).send({ theme: 'dark' });

    // There is no route that takes a user id, so the only thing to prove is
    // that the other mentor's own settings are untouched.
    const theirs = await request(app).get('/api/preferences').set(authHeader(other));
    expect(theirs.body.theme).toBe('system');
  });

  it('refuses a theme it does not have', async () => {
    const res = await request(app).put('/api/preferences')
      .set(authHeader(mentor)).send({ theme: 'midnight' });

    expect(res.status).toBe(400);
  });

  it('refuses an unknown field rather than passing it through', async () => {
    const res = await request(app).put('/api/preferences')
      .set(authHeader(mentor)).send({ role: 'SUPER_ADMIN' });

    expect(res.status).toBe(400);
    const user = await prisma.user.findUnique({ where: { id: mentor.id } });
    expect(user.role).toBe('MENTOR');
  });

  it('requires a session', async () => {
    expect((await request(app).get('/api/preferences')).status).toBe(401);
    expect((await request(app).put('/api/preferences').send({ theme: 'dark' })).status).toBe(401);
  });
});

describe('academic defaults', () => {
  it('stores a department, semester and year for the entry screens', async () => {
    const res = await request(app).put('/api/preferences')
      .set(authHeader(mentor))
      .send({ defaultDepartmentId: department.id, defaultSemester: 3, defaultAcademicYear: 2026 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      defaultDepartmentId: department.id,
      defaultSemester: 3,
      defaultAcademicYear: 2026,
    });
  });

  it('refuses a department the user cannot see', async () => {
    const otherDepartment = await createDepartment({ code: 'ECE' });

    const res = await request(app).put('/api/preferences')
      .set(authHeader(mentor))
      .send({ defaultDepartmentId: otherDepartment.id });

    expect(res.status).toBe(403);
  });

  it('offers only the departments the user may choose from', async () => {
    await createDepartment({ code: 'ECE' });

    const mine = await request(app).get('/api/preferences/departments').set(authHeader(mentor));
    expect(mine.body.map(d => d.code)).toEqual(['CSE']);

    const all = await request(app).get('/api/preferences/departments').set(authHeader(superAdmin));
    expect(all.body.map(d => d.code).sort()).toEqual(['CSE', 'ECE']);
  });

  it('rejects a semester outside 1-8', async () => {
    const res = await request(app).put('/api/preferences')
      .set(authHeader(mentor)).send({ defaultSemester: 12 });

    expect(res.status).toBe(400);
  });
});

describe('notification switches', () => {
  it('keeps the digest schedule the jobs read in step with the switches', async () => {
    // The digest jobs select on User.digestFrequency, which predates this
    // table. Two sources of truth for "do I get an email" would mean a switch
    // that appears to work and changes nothing.
    await request(app).put('/api/preferences')
      .set(authHeader(mentor))
      .send({ notifyDailyDigest: false, notifyWeeklyDigest: true });

    let user = await prisma.user.findUnique({ where: { id: mentor.id } });
    expect(user.digestFrequency).toBe('WEEKLY');

    await request(app).put('/api/preferences')
      .set(authHeader(mentor))
      .send({ notifyDailyDigest: false, notifyWeeklyDigest: false });

    user = await prisma.user.findUnique({ where: { id: mentor.id } });
    expect(user.digestFrequency).toBe('OFF');

    await request(app).put('/api/preferences')
      .set(authHeader(mentor))
      .send({ notifyDailyDigest: true });

    user = await prisma.user.findUnique({ where: { id: mentor.id } });
    expect(user.digestFrequency).toBe('DAILY');
  });

  it('reads back the existing digest setting for somebody who has never opened settings', async () => {
    await prisma.user.update({ where: { id: mentor.id }, data: { digestFrequency: 'WEEKLY' } });

    const res = await request(app).get('/api/preferences').set(authHeader(mentor));

    expect(res.body.notifyDailyDigest).toBe(false);
    expect(res.body.notifyWeeklyDigest).toBe(true);
  });
});

describe('high-severity alert email', () => {
  const raiseHighAlert = async (student, message = 'Attendance is 40% (below 75%).') => {
    await prisma.alert.create({
      data: {
        semesterRecordId: student.semesterRecord.id,
        type: 'LOW_ATTENDANCE',
        severity: 'HIGH',
        message,
      },
    });
  };

  it('does not send a backlog on the first run after switching it on', async () => {
    const student = await createStudent({ mentorId: mentor.id });
    await raiseHighAlert(student);

    await request(app).put('/api/preferences')
      .set(authHeader(mentor)).send({ notifyHighSeverity: true });

    const first = await runHighSeverityNotifications();

    expect(first.sent).toBe(0);
    expect(sent).toHaveLength(0);

    // The watermark is set, so the next new alert does go out.
    const preference = await prisma.userPreference.findUnique({ where: { userId: mentor.id } });
    expect(preference.highSeverityNotifiedAt).not.toBeNull();
  });

  it('sends one email covering everything new, not one per alert', async () => {
    const student = await createStudent({ mentorId: mentor.id });

    await request(app).put('/api/preferences')
      .set(authHeader(mentor)).send({ notifyHighSeverity: true });
    await runHighSeverityNotifications();

    await raiseHighAlert(student, 'Attendance in CS301 is 40% (below 75%).');
    await raiseHighAlert(student, 'Attendance in CS302 is 51% (below 75%).');

    const result = await runHighSeverityNotifications();

    expect(result.sent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(mentor.email);
    expect(sent[0].text).toContain('CS301');
    expect(sent[0].text).toContain('CS302');
    expect(sent[0].subject).toContain('2');
  });

  it('sends nothing twice', async () => {
    const student = await createStudent({ mentorId: mentor.id });

    await request(app).put('/api/preferences')
      .set(authHeader(mentor)).send({ notifyHighSeverity: true });
    await runHighSeverityNotifications();

    await raiseHighAlert(student);
    await runHighSeverityNotifications();
    expect(sent).toHaveLength(1);

    await runHighSeverityNotifications();
    expect(sent).toHaveLength(1);
  });

  it('leaves out mentors who did not ask, and other mentors\' students', async () => {
    const mine = await createStudent({ mentorId: mentor.id });
    const theirs = await createStudent({ mentorId: other.id });

    await request(app).put('/api/preferences')
      .set(authHeader(mentor)).send({ notifyHighSeverity: true });
    await runHighSeverityNotifications();

    await raiseHighAlert(mine, 'Mine.');
    await raiseHighAlert(theirs, 'Theirs.');

    await runHighSeverityNotifications();

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(mentor.email);
    expect(sent[0].text).toContain('Mine.');
    expect(sent[0].text).not.toContain('Theirs.');
  });
});

describe('institution settings', () => {
  it('is readable by anybody signed in and says who may edit it', async () => {
    const asMentor = await request(app).get('/api/preferences/institution').set(authHeader(mentor));
    expect(asMentor.status).toBe(200);
    expect(asMentor.body.canEdit).toBe(false);
    expect(asMentor.body.attendanceCritical).toBe(75);

    const asHod = await request(app).get('/api/preferences/institution').set(authHeader(hod));
    expect(asHod.body.canEdit).toBe(true);
  });

  it('is writable by a HOD and refused to a mentor', async () => {
    const refused = await request(app).put('/api/preferences/institution')
      .set(authHeader(mentor)).send({ attendanceCritical: 70 });
    expect(refused.status).toBe(403);

    const allowed = await request(app).put('/api/preferences/institution')
      .set(authHeader(hod)).send({ name: 'Test Institute of Technology', attendanceCritical: 70 });
    expect(allowed.status).toBe(200);
    expect(allowed.body.attendanceCritical).toBe(70);
  });

  it('refuses a critical threshold above the warning one', async () => {
    const res = await request(app).put('/api/preferences/institution')
      .set(authHeader(hod)).send({ attendanceCritical: 90, attendanceWarning: 80 });

    expect(res.status).toBe(400);
  });

  it('refuses a threshold of zero, which would switch the alerts off silently', async () => {
    const res = await request(app).put('/api/preferences/institution')
      .set(authHeader(hod)).send({ attendanceCritical: 0 });

    expect(res.status).toBe(400);
  });

  it('changes what the alert engine actually does', async () => {
    // 72% is critical under the default 75, and merely a warning under 70.
    expect(buildAttendanceAlerts({ classesHeld: 100, classesAttended: 72 })[0].severity)
      .toBe('HIGH');

    await request(app).put('/api/preferences/institution')
      .set(authHeader(hod)).send({ attendanceCritical: 70, attendanceWarning: 85 });

    const settings = await getInstitutionSettings();
    expect(settings.attendanceCritical).toBe(70);

    const alerts = buildAttendanceAlerts({
      classesHeld: 100,
      classesAttended: 72,
      critical: settings.attendanceCritical,
      warning: settings.attendanceWarning,
    });

    expect(alerts[0].severity).toBe('MEDIUM');
    expect(alerts[0].message).toContain('below 85%');
  });

  it('raises the alert a saved attendance figure implies, at the configured threshold', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    const subject = await createSubject({ departmentCode: 'CSE', semester: 3, code: 'CSE-T1' });

    await request(app).put('/api/preferences/institution')
      .set(authHeader(hod)).send({ attendanceCritical: 60, attendanceWarning: 65 });

    await request(app).post('/api/attendance/bulk').set(authHeader(mentor)).send({
      subjectId: subject.id,
      semester: 3,
      academicYear: 2026,
      rows: [{ studentId: student.student.id, classesHeld: 100, classesAttended: 72 }],
    });

    const alerts = await prisma.alert.findMany({
      where: { semesterRecordId: student.semesterRecord.id, type: 'LOW_ATTENDANCE' },
    });

    // 72% clears both of the lowered thresholds, so nothing should fire.
    expect(alerts).toHaveLength(0);
  });
});
