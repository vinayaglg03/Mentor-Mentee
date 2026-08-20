import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma, resetDatabase, createUser, authHeader } from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('POST /api/auth/register', () => {
  it('ignores a requested ADMIN role and creates an unapproved MENTOR', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Sneaky', email: 'sneaky@example.edu', password: 'PasswordLongEnough', role: 'ADMIN' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('MENTOR');

    const created = await prisma.user.findUnique({ where: { email: 'sneaky@example.edu' } });
    expect(created.role).toBe('MENTOR');
    expect(created.approved).toBe(false);
  });

  it('rejects passwords shorter than 10 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Short', email: 'short@example.edu', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.details.map(d => d.field)).toContain('password');
  });
});

describe('POST /api/auth/login', () => {
  it('refuses an unapproved account', async () => {
    const user = await createUser({ approved: false, password: 'Password123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Password123' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Your account is awaiting approval by your HOD.');
  });

  it('lets an approved account in', async () => {
    const user = await createUser({ approved: true, password: 'Password123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});

describe('admin user administration', () => {
  it('rejects user creation by a mentor', async () => {
    const mentor = await createUser({ role: 'MENTOR' });

    const res = await request(app)
      .post('/api/auth/users')
      .set(authHeader(mentor))
      .send({ name: 'New HOD', email: 'hod@example.edu', password: 'PasswordLongEnough', role: 'ADMIN' });

    expect(res.status).toBe(403);
  });

  it('creates an approved user with an explicit role for an admin', async () => {
    const admin = await createUser({ role: 'ADMIN' });

    const res = await request(app)
      .post('/api/auth/users')
      .set(authHeader(admin))
      .send({ name: 'New HOD', email: 'hod@example.edu', password: 'PasswordLongEnough', role: 'ADMIN' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.user.approved).toBe(true);
  });

  it('lists and approves pending users', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const pending = await createUser({ approved: false });

    const list = await request(app).get('/api/auth/users/pending').set(authHeader(admin));
    expect(list.status).toBe(200);
    expect(list.body.map(u => u.id)).toEqual([pending.id]);

    const approve = await request(app).put(`/api/auth/users/${pending.id}/approve`).set(authHeader(admin));
    expect(approve.status).toBe(200);
    expect(approve.body.user.approved).toBe(true);
  });
});
