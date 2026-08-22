import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import config from '../src/config.js';
import { prisma, resetDatabase, createUser, createHod, authHeader } from './helpers.js';
import { verifyClaims, GoogleAuthError } from '../src/lib/google.js';
import { rotateRefreshToken, issueRefreshToken, SessionError, pruneExpiredTokens } from '../src/lib/sessions.js';

let mentor;

const idToken = (claims) => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.signature`;
};

const validClaims = (overrides = {}) => ({
  iss: 'https://accounts.google.com',
  aud: config.google.clientId || 'test-client-id',
  exp: Math.floor(Date.now() / 1000) + 600,
  sub: 'google-123',
  email: 'asha@college.edu.in',
  email_verified: true,
  hd: 'college.edu.in',
  name: 'Asha Rao',
  ...overrides,
});

// The cookie the browser would send back.
const refreshCookie = (res) => {
  const header = res.headers['set-cookie'] || [];
  const cookie = header.find(value => value.startsWith(`${config.auth.cookieName}=`));
  return cookie ? cookie.split(';')[0] : null;
};

beforeEach(async () => {
  await resetDatabase();
  mentor = await createUser({ role: 'MENTOR', password: 'PasswordLongEnough' });
});

afterAll(() => prisma.$disconnect());

describe('Google claim verification', () => {
  beforeEach(() => {
    config.google.clientId = 'test-client-id';
    config.google.allowedDomains = ['college.edu.in'];
  });

  it('accepts a well-formed token from an allowed domain', () => {
    const profile = verifyClaims(idToken(validClaims()));

    expect(profile).toMatchObject({
      googleId: 'google-123',
      email: 'asha@college.edu.in',
      domain: 'college.edu.in',
    });
  });

  it('rejects another domain with a message naming the allowed one', () => {
    try {
      verifyClaims(idToken(validClaims({ email: 'someone@gmail.com', hd: undefined })));
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(GoogleAuthError);
      expect(error.status).toBe(403);
      expect(error.message).toContain('college.edu.in');
    }
  });

  it('rejects a token issued for a different application', () => {
    expect(() => verifyClaims(idToken(validClaims({ aud: 'someone-elses-client-id' }))))
      .toThrow(/different application/);
  });

  it('rejects a token that did not come from Google', () => {
    expect(() => verifyClaims(idToken(validClaims({ iss: 'https://evil.example.com' }))))
      .toThrow(/not issued by Google/);
  });

  it('rejects an expired token and an unverified email', () => {
    expect(() => verifyClaims(idToken(validClaims({ exp: Math.floor(Date.now() / 1000) - 60 }))))
      .toThrow(/expired/);

    expect(() => verifyClaims(idToken(validClaims({ email_verified: false }))))
      .toThrow(/unverified/);
  });

  it('rejects a malformed token', () => {
    expect(() => verifyClaims('not-a-jwt')).toThrow(/malformed/);
  });

  it('falls back to the email domain when Google sends no hd claim', () => {
    const profile = verifyClaims(idToken(validClaims({ hd: undefined })));
    expect(profile.domain).toBe('college.edu.in');
  });

  it('allows any domain when no allowlist is configured', () => {
    config.google.allowedDomains = [];
    expect(verifyClaims(idToken(validClaims({ email: 'anyone@gmail.com', hd: undefined }))).email)
      .toBe('anyone@gmail.com');
  });
});

describe('GET /api/auth/config', () => {
  it('tells the sign-in screen what to offer', async () => {
    const res = await request(app).get('/api/auth/config');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('googleEnabled');
    expect(res.body).toHaveProperty('passwordEnabled');
    expect(Array.isArray(res.body.allowedDomains)).toBe(true);
  });
});

describe('sessions', () => {
  it('returns a short-lived access token and sets an httpOnly refresh cookie', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: mentor.email, password: 'PasswordLongEnough' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.expiresInMinutes).toBe(config.auth.accessTokenMinutes);

    const cookie = (res.headers['set-cookie'] || []).find(value => value.startsWith(config.auth.cookieName));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=');
    expect(cookie).toContain('Path=/api/auth');

    // The refresh token itself is never returned in the body.
    expect(JSON.stringify(res.body)).not.toContain(cookie.split('=')[1].split(';')[0]);
  });

  it('stores only a hash of the refresh token', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: mentor.email, password: 'PasswordLongEnough' });

    const raw = decodeURIComponent(refreshCookie(res).split('=')[1]);
    const stored = await prisma.refreshToken.findMany();

    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).not.toBe(raw);
    expect(stored[0].tokenHash).toHaveLength(64);
  });

  it('rotates the refresh token on every use', async () => {
    const login = await request(app).post('/api/auth/login')
      .send({ email: mentor.email, password: 'PasswordLongEnough' });

    const first = refreshCookie(login);
    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', first);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.token).toBeTruthy();

    const second = refreshCookie(refreshed);
    expect(second).not.toBe(first);

    const rows = await prisma.refreshToken.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0].revokedAt).not.toBeNull();
    expect(rows[0].replacedById).toBe(rows[1].id);
    // Same family: it is the same sign-in, continued.
    expect(rows[0].family).toBe(rows[1].family);
  });

  it('treats replay of a rotated token as theft and ends the whole family', async () => {
    const login = await request(app).post('/api/auth/login')
      .send({ email: mentor.email, password: 'PasswordLongEnough' });

    const stolen = refreshCookie(login);
    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', stolen);
    const current = refreshCookie(rotated);

    // The attacker replays the old one.
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', stolen);
    expect(replay.status).toBe(401);

    // And the legitimate device is signed out too, which is the point.
    const afterwards = await request(app).post('/api/auth/refresh').set('Cookie', current);
    expect(afterwards.status).toBe(401);

    const rows = await prisma.refreshToken.findMany();
    expect(rows.every(row => row.revokedAt !== null)).toBe(true);
  });

  it('refuses a refresh with no cookie, and clears the cookie on failure', async () => {
    const res = await request(app).post('/api/auth/refresh');

    expect(res.status).toBe(401);
    const cookie = (res.headers['set-cookie'] || []).find(value => value.startsWith(config.auth.cookieName));
    expect(cookie).toContain('Max-Age=0');
  });

  it('signs out one device', async () => {
    const login = await request(app).post('/api/auth/login')
      .send({ email: mentor.email, password: 'PasswordLongEnough' });
    const cookie = refreshCookie(login);

    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(200);

    const retry = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(retry.status).toBe(401);
  });

  it('signs out everywhere', async () => {
    const sessions = [];
    for (let i = 0; i < 3; i++) {
      const login = await request(app).post('/api/auth/login')
        .send({ email: mentor.email, password: 'PasswordLongEnough' });
      sessions.push({ cookie: refreshCookie(login), token: login.body.token });
    }

    const out = await request(app).post('/api/auth/logout-everywhere')
      .set('Authorization', `Bearer ${sessions[0].token}`);

    expect(out.status).toBe(200);
    expect(out.body.sessions).toBe(3);

    for (const session of sessions) {
      const retry = await request(app).post('/api/auth/refresh').set('Cookie', session.cookie);
      expect(retry.status).toBe(401);
    }
  });

  it('will not refresh an unapproved account', async () => {
    const pending = await createUser({ approved: true, password: 'PasswordLongEnough' });
    const login = await request(app).post('/api/auth/login')
      .send({ email: pending.email, password: 'PasswordLongEnough' });
    const cookie = refreshCookie(login);

    await prisma.user.update({ where: { id: pending.id }, data: { approved: false } });

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('rejects an expired refresh token', async () => {
    const { token, record } = await issueRefreshToken(mentor, {});
    await prisma.refreshToken.update({
      where: { id: record.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(rotateRefreshToken(token, {})).rejects.toBeInstanceOf(SessionError);
  });

  it('prunes expired tokens', async () => {
    const { record } = await issueRefreshToken(mentor, {});
    await prisma.refreshToken.update({
      where: { id: record.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await pruneExpiredTokens();
    expect(await prisma.refreshToken.count()).toBe(0);
  });
});

describe('password login can be switched off', () => {
  it('refuses a mentor but still lets a super admin in', async () => {
    const original = config.auth.passwordLoginEnabled;
    config.auth.passwordLoginEnabled = false;

    try {
      const refused = await request(app).post('/api/auth/login')
        .send({ email: mentor.email, password: 'PasswordLongEnough' });

      expect(refused.status).toBe(403);
      expect(refused.body.error).toMatch(/Google/);

      const superAdmin = await createUser({ role: 'SUPER_ADMIN', password: 'PasswordLongEnough' });
      const allowed = await request(app).post('/api/auth/login')
        .send({ email: superAdmin.email, password: 'PasswordLongEnough' });

      expect(allowed.status).toBe(200);
    } finally {
      config.auth.passwordLoginEnabled = original;
    }
  });

  it('turns self-registration off with it', async () => {
    const original = config.auth.passwordLoginEnabled;
    config.auth.passwordLoginEnabled = false;

    try {
      const res = await request(app).post('/api/auth/register')
        .send({ name: 'Someone', email: 'someone@college.edu.in', password: 'PasswordLongEnough' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Google/);
    } finally {
      config.auth.passwordLoginEnabled = original;
    }
  });
});

describe('approval assigns a place in the college', () => {
  it('sets role, department and section in one step', async () => {
    const hod = await createHod({ departmentCode: 'CSE' });
    const department = await prisma.department.findUnique({ where: { code: 'CSE' } });
    const batch = await prisma.batch.create({
      data: { departmentId: department.id, admissionYear: 2024, currentSemester: 3 },
    });
    const section = await prisma.section.create({ data: { batchId: batch.id, name: 'A' } });

    const pending = await createUser({ approved: false });

    const res = await request(app)
      .put(`/api/auth/users/${pending.id}/approve`)
      .set(authHeader(hod))
      .send({ role: 'COORDINATOR', departmentId: department.id, sectionId: section.id });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ approved: true, role: 'COORDINATOR', departmentId: department.id });

    const updated = await prisma.section.findUnique({ where: { id: section.id } });
    expect(updated.coordinatorId).toBe(pending.id);
  });

  it('still refuses a HOD granting a HOD role', async () => {
    const hod = await createHod({ departmentCode: 'CSE' });
    const pending = await createUser({ approved: false, departmentCode: 'CSE' });

    const res = await request(app)
      .put(`/api/auth/users/${pending.id}/approve`)
      .set(authHeader(hod))
      .send({ role: 'HOD' });

    expect(res.status).toBe(403);
    expect((await prisma.user.findUnique({ where: { id: pending.id } })).approved).toBe(false);
  });

  it('approves without changing anything when given no body', async () => {
    const hod = await createHod({ departmentCode: 'CSE' });
    const pending = await createUser({ approved: false, departmentCode: 'CSE' });

    const res = await request(app).put(`/api/auth/users/${pending.id}/approve`).set(authHeader(hod));

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ approved: true, role: 'MENTOR' });
  });
});
