import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma, resetDatabase, createUser, createStudent, authHeader, createHod } from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('maxStudents cap', () => {
  it('stops a mentor claiming past their limit', async () => {
    const mentor = await createUser({ role: 'MENTOR', maxStudents: 1 });
    await createStudent({ mentorId: mentor.id });
    const free = await createStudent();

    const res = await request(app)
      .put('/api/mentors/claim-student')
      .set(authHeader(mentor))
      .send({ studentId: free.student.id });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit of 1/);

    const unchanged = await prisma.student.findUnique({ where: { id: free.student.id } });
    expect(unchanged.mentorId).toBeNull();
  });

  it('allows a claim below the limit', async () => {
    const mentor = await createUser({ role: 'MENTOR', maxStudents: 2 });
    await createStudent({ mentorId: mentor.id });
    const free = await createStudent();

    const res = await request(app)
      .put('/api/mentors/claim-student')
      .set(authHeader(mentor))
      .send({ studentId: free.student.id });

    expect(res.status).toBe(200);
    expect(res.body.student.mentorId).toBe(mentor.id);
  });

  it('stops a HOD assigning past the limit', async () => {
    const admin = await createHod();
    const mentor = await createUser({ role: 'MENTOR', maxStudents: 1 });
    await createStudent({ mentorId: mentor.id });
    const free = await createStudent();

    const res = await request(app)
      .put(`/api/hod/students/${free.student.id}/assign`)
      .set(authHeader(admin))
      .send({ mentorId: mentor.id });

    expect(res.status).toBe(400);
  });

  it('still allows re-saving a student against the mentor they already have', async () => {
    const admin = await createHod();
    const mentor = await createUser({ role: 'MENTOR', maxStudents: 1 });
    const own = await createStudent({ mentorId: mentor.id });

    const res = await request(app)
      .put(`/api/hod/students/${own.student.id}/assign`)
      .set(authHeader(admin))
      .send({ mentorId: mentor.id });

    expect(res.status).toBe(200);
  });

  it('ignores students who have left when counting capacity', async () => {
    const mentor = await createUser({ role: 'MENTOR', maxStudents: 1 });
    await createStudent({ mentorId: mentor.id, status: 'DROPPED' });
    const free = await createStudent();

    const res = await request(app)
      .put('/api/mentors/claim-student')
      .set(authHeader(mentor))
      .send({ studentId: free.student.id });

    expect(res.status).toBe(200);
  });
});
