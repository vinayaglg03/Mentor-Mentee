import crypto from 'node:crypto';
import config from '../config.js';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export class GoogleAuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = 'GoogleAuthError';
    this.status = status;
  }
}

export const isConfigured = () => Boolean(config.google.clientId && config.google.clientSecret);

export const newState = () => crypto.randomBytes(24).toString('base64url');

// The consent screen. `hd` asks Google to show only accounts in that domain;
// it is a convenience for the user, not a security control - the real check
// happens on the claims we get back.
export const authorizationUrl = ({ state }) => {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });

  if (config.google.allowedDomains.length === 1) {
    params.set('hd', config.google.allowedDomains[0]);
  }

  return `${AUTH_ENDPOINT}?${params.toString()}`;
};

// Base64url JSON, no signature check. That is safe here and only here: the
// token came directly from Google's token endpoint over TLS, authenticated
// with our client secret, rather than from the browser. A client-supplied
// id_token would have to be verified against Google's JWKS instead - which is
// exactly why this app uses the authorization code flow and never accepts an
// id_token from the front end.
const decodeIdToken = (idToken) => {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new GoogleAuthError('Google returned a malformed token.');

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new GoogleAuthError('Google returned a token we could not read.');
  }
};

export const exchangeCode = async (code) => {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new GoogleAuthError(`Google rejected the sign-in attempt (${response.status}). ${detail.slice(0, 200)}`);
  }

  return response.json();
};

// Everything that decides whether this person may sign in.
export const verifyClaims = (idToken, { now = Date.now() } = {}) => {
  const claims = decodeIdToken(idToken);

  const issuers = ['https://accounts.google.com', 'accounts.google.com'];
  if (!issuers.includes(claims.iss)) {
    throw new GoogleAuthError('That token was not issued by Google.');
  }

  if (claims.aud !== config.google.clientId) {
    throw new GoogleAuthError('That token was issued for a different application.');
  }

  if (typeof claims.exp === 'number' && claims.exp * 1000 < now) {
    throw new GoogleAuthError('That sign-in has expired. Try again.');
  }

  if (!claims.email) {
    throw new GoogleAuthError('Google did not return an email address.');
  }

  if (claims.email_verified === false) {
    throw new GoogleAuthError('That Google account has an unverified email address.');
  }

  const email = String(claims.email).toLowerCase();
  const domain = String(claims.hd || email.split('@')[1] || '').toLowerCase();
  const allowed = config.google.allowedDomains;

  if (allowed.length > 0 && !allowed.includes(domain)) {
    throw new GoogleAuthError(
      `Only ${allowed.join(' or ')} accounts can sign in here. You used ${email}.`,
      403
    );
  }

  return {
    googleId: claims.sub,
    email,
    name: claims.name || email.split('@')[0],
    avatarUrl: claims.picture || null,
    domain,
  };
};
