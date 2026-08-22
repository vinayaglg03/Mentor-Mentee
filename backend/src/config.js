import dotenv from 'dotenv';

dotenv.config();

const errors = [];

const { DATABASE_URL, JWT_SECRET } = process.env;

if (!DATABASE_URL) {
  errors.push('DATABASE_URL is required (PostgreSQL connection string).');
}

if (!JWT_SECRET) {
  errors.push('JWT_SECRET is required.');
} else if (JWT_SECRET.length < 32) {
  errors.push(`JWT_SECRET must be at least 32 characters (got ${JWT_SECRET.length}).`);
}

const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  errors.push(`PORT must be a valid port number (got "${process.env.PORT}").`);
}

if (errors.length > 0) {
  console.error(
    'Invalid environment configuration:\n' +
    errors.map(e => `  - ${e}`).join('\n') +
    '\nSee backend/.env.example for the full list of variables.'
  );
  process.exit(1);
}

const passwordLoginEnabled = process.env.AUTH_PASSWORD_ENABLED === 'true';
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

// One of the two has to work, or nobody can sign in.
if (!passwordLoginEnabled && !googleClientId) {
  errors.push(
    'No way to sign in: set GOOGLE_CLIENT_ID (and GOOGLE_CLIENT_SECRET) for Google sign-in, ' +
    'or AUTH_PASSWORD_ENABLED=true for password login.'
  );
}

if (googleClientId && !googleClientSecret) {
  errors.push('GOOGLE_CLIENT_SECRET is required when GOOGLE_CLIENT_ID is set.');
}

const config = {
  databaseUrl: DATABASE_URL,
  // Where the app is reachable, used for links in emails.
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  mail: {
    // console (default) | smtp | resend
    driver: process.env.MAIL_DRIVER || 'console',
    from: process.env.MAIL_FROM || 'AMIS <no-reply@localhost>',
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    apiKey: process.env.RESEND_API_KEY || '',
  },
  auth: {
    // Password login is off once Google sign-in works. A SUPER_ADMIN can
    // always use it as a break-glass route - see allowPasswordLogin below.
    passwordLoginEnabled,
    // Minutes. Short, because the access token lives in browser memory and
    // is refreshed silently.
    accessTokenMinutes: Number(process.env.ACCESS_TOKEN_MINUTES || 15),
    // Days. The refresh token is an httpOnly cookie and rotates on use.
    refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS || 30),
    cookieName: process.env.REFRESH_COOKIE_NAME || 'amis_refresh',
    // Off in development because localhost is not https.
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    // 'lax' is right when the API and the app share a registrable domain.
    // Set 'none' (with COOKIE_SECURE=true) only if they genuinely differ.
    cookieSameSite: process.env.COOKIE_SAMESITE || 'lax',
    cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  },
  google: {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    // Must match the redirect URI registered in the Google Cloud console.
    redirectUri: process.env.GOOGLE_REDIRECT_URI
      || `http://localhost:${process.env.PORT || 5000}/api/auth/google/callback`,
    // Only accounts in these Workspace domains may sign in. Empty means any
    // Google account, which you almost certainly do not want in production.
    allowedDomains: (process.env.ALLOWED_EMAIL_DOMAINS || '')
      .split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean),
  },
  notifications: {
    // A HIGH alert older than this appears in the HOD's weekly digest.
    escalateAfterDays: Number(process.env.ALERT_ESCALATION_DAYS || 7),
    // A mentee with no logged interaction for this long is flagged.
    inactivityDays: Number(process.env.INACTIVITY_DAYS || 30),
    // Set to false to stop the in-process scheduler (e.g. when running more
    // than one instance and using an external scheduler instead).
    scheduleEnabled: process.env.NOTIFICATIONS_SCHEDULE !== 'false',
    dailyDigestCron: process.env.DAILY_DIGEST_CRON || '30 1 * * *',
    weeklyDigestCron: process.env.WEEKLY_DIGEST_CRON || '0 2 * * 1',
    inactivityCron: process.env.INACTIVITY_CRON || '0 3 * * *',
  },
  // Printed at the top of every exported report.
  college: {
    name: process.env.COLLEGE_NAME || 'Your College Name',
    address: process.env.COLLEGE_ADDRESS || '',
    department: process.env.COLLEGE_DEPARTMENT || '',
    logoPath: process.env.COLLEGE_LOGO_PATH || '',
  },
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecret: JWT_SECRET,
  port,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',').map(s => s.trim()).filter(Boolean),
};

export default config;
