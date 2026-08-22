import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import prisma from '../prismaClient.js';
import config from '../config.js';
import logger from '../logger.js';

// Access tokens are short-lived and live in browser memory. Refresh tokens
// are long-lived, stored only as a hash, and rotate on every use: presenting
// an already-rotated token means it leaked, so the whole family is revoked.

const dayMs = 24 * 60 * 60 * 1000;

export const issueAccessToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: `${config.auth.accessTokenMinutes}m` }
  );

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

const newToken = () => crypto.randomBytes(48).toString('base64url');

export const issueRefreshToken = async (user, { family, userAgent, ip } = {}) => {
  const token = newToken();

  const record = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hash(token),
      family: family || crypto.randomUUID(),
      expiresAt: new Date(Date.now() + config.auth.refreshTokenDays * dayMs),
      userAgent: userAgent ?? null,
      ip: ip ?? null,
    },
  });

  return { token, record };
};

export const revokeFamily = (family) =>
  prisma.refreshToken.updateMany({
    where: { family, revokedAt: null },
    data: { revokedAt: new Date() },
  });

export const revokeAllForUser = (userId) =>
  prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

export class SessionError extends Error {
  constructor(message = 'Your session has expired. Sign in again.') {
    super(message);
    this.name = 'SessionError';
    this.status = 401;
  }
}

// Exchanges a refresh token for a new pair. Returns the user and the new
// refresh token to set on the cookie.
export const rotateRefreshToken = async (token, { userAgent, ip } = {}) => {
  if (!token) throw new SessionError('You are not signed in.');

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: true },
  });

  if (!existing) throw new SessionError();

  if (existing.revokedAt) {
    // Somebody is replaying a token that was already rotated. Either it
    // leaked or a device is out of step; either way, end the family.
    logger.warn({ userId: existing.userId, family: existing.family }, 'Refresh token reuse detected');
    await revokeFamily(existing.family);
    throw new SessionError('Your session was ended for security reasons. Sign in again.');
  }

  if (existing.expiresAt < new Date()) {
    throw new SessionError();
  }

  if (!existing.user.approved) {
    throw new SessionError('Your account is waiting for approval.');
  }

  const { token: nextToken, record } = await issueRefreshToken(existing.user, {
    family: existing.family,
    userAgent,
    ip,
  });

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), replacedById: record.id },
  });

  return {
    user: existing.user,
    accessToken: issueAccessToken(existing.user),
    refreshToken: nextToken,
  };
};

export const revokeToken = async (token) => {
  if (!token) return;

  await prisma.refreshToken.updateMany({
    where: { tokenHash: hash(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

// --- cookie handling -----------------------------------------------------
// Express 5 does not parse cookies, and this is the only cookie the app uses,
// so a dependency would be more surface than it is worth.

export const readCookie = (req, name) => {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }

  return null;
};

export const refreshCookieFrom = (req) => readCookie(req, config.auth.cookieName);

const cookieAttributes = (maxAgeMs) => [
  'Path=/api/auth',
  'HttpOnly',
  `SameSite=${config.auth.cookieSameSite}`,
  config.auth.cookieSecure ? 'Secure' : null,
  config.auth.cookieDomain ? `Domain=${config.auth.cookieDomain}` : null,
  `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
].filter(Boolean);

export const setRefreshCookie = (res, token) => {
  const maxAge = config.auth.refreshTokenDays * dayMs;
  res.append(
    'Set-Cookie',
    `${config.auth.cookieName}=${encodeURIComponent(token)}; ${cookieAttributes(maxAge).join('; ')}`
  );
};

export const clearRefreshCookie = (res) => {
  res.append(
    'Set-Cookie',
    `${config.auth.cookieName}=; ${cookieAttributes(0).join('; ')}`
  );
};

// Sign-in and refresh both end here: an access token in the body, a refresh
// token in the cookie.
export const startSession = async (res, user, { userAgent, ip } = {}) => {
  const { token } = await issueRefreshToken(user, { userAgent, ip });
  setRefreshCookie(res, token);

  return {
    token: issueAccessToken(user),
    expiresInMinutes: config.auth.accessTokenMinutes,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      approved: user.approved,
      avatarUrl: user.avatarUrl,
    },
  };
};

// Housekeeping: expired and long-revoked rows are of no further use.
export const pruneExpiredTokens = () =>
  prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { lt: new Date(Date.now() - 30 * dayMs) } },
      ],
    },
  });
