import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import {
  prisma, resetDatabase, createUser, createStudent, createSubject, createDepartment,
  createHod, authHeader,
} from './helpers.js';

let mentor, other, hod, subject;

beforeEach(async () => {
  await resetDatabase();
  await createDepartment({ code: 'CSE' });
  hod = await createHod({ departmentCode: 'CSE' });
  mentor = await createUser({ role: 'MENTOR', departmentCode: 'CSE', maxStudents: 100 });
  other = await createUser({ role: 'MENTOR', departmentCode: 'CSE', maxStudents: 100 });
  subject = await createSubject({ departmentCode: 'CSE', semester: 3 });
});

afterAll(() => prisma.$disconnect());

const highAlert = (semesterRecordId, message = 'Attendance is 62.5% (below 75%).') =>
  prisma.alert.create({
    data: { semesterRecordId, type: 'LOW_ATTENDANCE', severity: 'HIGH', message },
  });

describe('GET /api/mentors/attention', () => {
  it('groups high alerts, quiet mentees and follow-ups due', async () => {
    const risky = await createStudent({ mentorId: mentor.id, semester: 3 });
    await highAlert(risky.semesterRecord.id);

    const quiet = await createStudent({ mentorId: mentor.id, semester: 3 });

    const followedUp = await createStudent({ mentorId: mentor.id, semester: 3 });
    await prisma.progressLog.create({
      data: {
        semesterRecordId: followedUp.semesterRecord.id,
        mentorId: mentor.id,
        remark: 'Agreed a plan',
        actionItems: 'Bring the lab record',
        date: new Date(),
        followUpDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
    });

    const res = await request(app).get('/api/mentors/attention').set(authHeader(mentor));

    expect(res.status).toBe(200);
    expect(res.body.atRisk.map(row => row.id)).toEqual([risky.student.id]);
    expect(res.body.quiet.map(row => row.id)).toContain(quiet.student.id);
    expect(res.body.followUps).toHaveLength(1);
    expect(res.body.followUps[0].actionItems).toBe('Bring the lab record');
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('carries the attendance figure for a flagged student', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    await highAlert(student.semesterRecord.id);
    await prisma.attendance.create({
      data: {
        semesterRecordId: student.semesterRecord.id,
        subjectId: subject.id,
        classesHeld: 40,
        classesAttended: 25,
      },
    });

    const res = await request(app).get('/api/mentors/attention').set(authHeader(mentor));

    expect(res.body.atRisk[0].attendancePercent).toBe(62.5);
  });

  it('leaves out somebody spoken to recently', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    await prisma.progressLog.create({
      data: {
        semesterRecordId: student.semesterRecord.id,
        mentorId: mentor.id,
        remark: 'Spoke yesterday',
        date: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    const res = await request(app).get('/api/mentors/attention').set(authHeader(mentor));

    expect(res.body.quiet).toHaveLength(0);
  });

  it('counts days since the last interaction', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    await prisma.progressLog.create({
      data: {
        semesterRecordId: student.semesterRecord.id,
        mentorId: mentor.id,
        remark: 'A while ago',
        date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      },
    });

    const res = await request(app).get('/api/mentors/attention').set(authHeader(mentor));

    expect(res.body.quiet[0].daysSince).toBe(45);
  });

  it("shows nothing of another mentor's students", async () => {
    const theirs = await createStudent({ mentorId: other.id, semester: 3 });
    await highAlert(theirs.semesterRecord.id);

    const res = await request(app).get('/api/mentors/attention').set(authHeader(mentor));

    expect(res.body.atRisk).toHaveLength(0);
    expect(res.body.quiet).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it('gives a HOD their whole department', async () => {
    const a = await createStudent({ mentorId: mentor.id, semester: 3 });
    const b = await createStudent({ mentorId: other.id, semester: 3 });
    await highAlert(a.semesterRecord.id);
    await highAlert(b.semesterRecord.id);

    const res = await request(app).get('/api/mentors/attention').set(authHeader(hod));

    expect(res.body.atRisk).toHaveLength(2);
  });
});

describe('GET /api/students/search', () => {
  it('finds by roll number, partial name and email', async () => {
    const student = await createStudent({ mentorId: mentor.id });
    await prisma.student.update({
      where: { id: student.student.id },
      data: { name: 'Ananya Krishnan', rollNumber: '1AB22CS042', email: 'ananya@college.edu.in' },
    });

    for (const term of ['1AB22CS042', 'cs042', 'anany', 'ananya@college']) {
      const res = await request(app).get('/api/students/search')
        .set(authHeader(mentor)).query({ q: term });

      expect(res.status).toBe(200);
      expect(res.body.students.map(row => row.id), `searching "${term}"`).toEqual([student.student.id]);
    }
  });

  it('is case-insensitive', async () => {
    const student = await createStudent({ mentorId: mentor.id });
    await prisma.student.update({ where: { id: student.student.id }, data: { name: 'Bhavana Rao' } });

    const res = await request(app).get('/api/students/search')
      .set(authHeader(mentor)).query({ q: 'BHAVANA' });

    expect(res.body.students).toHaveLength(1);
  });

  it('needs at least two characters', async () => {
    await createStudent({ mentorId: mentor.id });

    const res = await request(app).get('/api/students/search').set(authHeader(mentor)).query({ q: 'a' });

    expect(res.status).toBe(200);
    expect(res.body.students).toEqual([]);
  });

  it("never returns another mentor's student", async () => {
    const theirs = await createStudent({ mentorId: other.id });
    await prisma.student.update({ where: { id: theirs.student.id }, data: { name: 'Hidden Person' } });

    const asMentor = await request(app).get('/api/students/search')
      .set(authHeader(mentor)).query({ q: 'Hidden' });
    expect(asMentor.body.students).toHaveLength(0);

    // Their HOD can see them.
    const asHod = await request(app).get('/api/students/search')
      .set(authHeader(hod)).query({ q: 'Hidden' });
    expect(asHod.body.students).toHaveLength(1);
  });

  it('reports open alert counts so the results are useful at a glance', async () => {
    const student = await createStudent({ mentorId: mentor.id, semester: 3 });
    await highAlert(student.semesterRecord.id);
    await prisma.alert.create({
      data: { semesterRecordId: student.semesterRecord.id, type: 'WEAK', severity: 'MEDIUM', message: 'weak' },
    });

    const res = await request(app).get('/api/students/search')
      .set(authHeader(mentor)).query({ q: student.student.rollNumber });

    expect(res.body.students[0]).toMatchObject({ openAlerts: 2, highAlerts: 1 });
  });

  it('excludes students who have left', async () => {
    const student = await createStudent({ mentorId: mentor.id, status: 'DROPPED' });

    const res = await request(app).get('/api/students/search')
      .set(authHeader(mentor)).query({ q: student.student.rollNumber });

    expect(res.body.students).toHaveLength(0);
  });
});
