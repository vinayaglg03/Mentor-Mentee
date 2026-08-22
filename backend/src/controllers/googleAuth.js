import prisma from '../prismaClient.js';
import config from '../config.js';
import logger from '../logger.js';
import {
  isConfigured, newState, authorizationUrl, exchangeCode, verifyClaims, GoogleAuthError,
} from '../lib/google.js';
import { startSession, readCookie } from '../lib/sessions.js';

const STATE_COOKIE = 'amis_oauth_state';
const STATE_TTL_MINUTES = 10;

const stateCookie = (value, maxAgeSeconds) => [
  `${STATE_COOKIE}=${value}`,
  'Path=/api/auth',
  'HttpOnly',
  `SameSite=${config.auth.cookieSameSite}`,
  config.auth.cookieSecure ? 'Secure' : null,
  `Max-Age=${maxAgeSeconds}`,
].filter(Boolean).join('; ');

// What the sign-in screen needs to know before it renders: which buttons to
// show, and which domains are accepted. Public by necessity.
export const authConfig = (req, res) => {
  res.json({
    googleEnabled: isConfigured(),
    passwordEnabled: config.auth.passwordLoginEnabled,
    allowedDomains: config.google.allowedDomains,
  });
};

export const startGoogleSignIn = (req, res, next) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ error: 'Google sign-in is not configured on this server.' });
    }

    const state = newState();
    res.append('Set-Cookie', stateCookie(state, STATE_TTL_MINUTES * 60));
    res.redirect(authorizationUrl({ state }));
  } catch (error) {
    next(error);
  }
};

// Where the user lands after Google. Never renders anything itself: it sets
// the session cookie and hands control back to the app.
const backToApp = (res, { error } = {}) => {
  const target = new URL('/auth/callback', config.appUrl);
  if (error) target.searchParams.set('error', error);
  res.redirect(target.toString());
};

export const googleCallback = async (req, res, next) => {
  try {
    if (!isConfigured()) {
      return backToApp(res, { error: 'Google sign-in is not configured on this server.' });
    }

    const { code, state, error: googleError } = req.query;

    if (googleError) {
      return backToApp(res, { error: 'Sign-in was cancelled.' });
    }

    const expectedState = readCookie(req, STATE_COOKIE);
    res.append('Set-Cookie', stateCookie('', 0));

    if (!code || !state || !expectedState || state !== expectedState) {
      return backToApp(res, { error: 'That sign-in link has expired. Try again.' });
    }

    const tokens = await exchangeCode(String(code));
    const profile = verifyClaims(tokens.id_token);

    // Existing account by google id first, then by email so an account
    // created before SSO keeps all of its history.
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId: profile.googleId }, { email: profile.email }] },
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: profile.googleId,
          avatarUrl: profile.avatarUrl,
          // A name typed by an admin is not overwritten by Google's.
          name: user.name || profile.name,
        },
      });
    } else {
      // First sign-in creates an unapproved account with the lowest role.
      // A HOD assigns role, department and section when they approve it.
      user = await prisma.user.create({
        data: {
          name: profile.name,
          email: profile.email,
          googleId: profile.googleId,
          avatarUrl: profile.avatarUrl,
          role: 'MENTOR',
          approved: false,
        },
      });

      logger.info({ email: profile.email }, 'New account created from Google sign-in, awaiting approval');
    }

    if (!user.approved) {
      return backToApp(res, { error: 'pending-approval' });
    }

    await startSession(res, user, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });

    backToApp(res);
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return backToApp(res, { error: error.message });
    }
    next(error);
  }
};
