import * as Sentry from '@sentry/node';
import logger from '../logger.js';

// Error monitoring is optional: with no DSN this is a no-op and the app
// behaves exactly as it did. What is not optional is that student names and
// email addresses never leave the building in an error report.

const SENSITIVE_KEYS = [
  'password', 'token', 'accesstoken', 'refreshtoken', 'authorization', 'cookie',
  'email', 'name', 'rollnumber', 'phone', 'mobile', 'address', 'avatarurl', 'remark',
  'actionitems', 'message',
];

const REDACTED = '[redacted]';

// Anything that looks like an email or a roll number, wherever it appears.
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

export const scrub = (value, depth = 0) => {
  if (depth > 6 || value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.replace(EMAIL_PATTERN, REDACTED);
  }

  if (Array.isArray(value)) return value.map(entry => scrub(entry, depth + 1));

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEYS.includes(key.toLowerCase()) ? REDACTED : scrub(entry, depth + 1),
      ])
    );
  }

  return value;
};

// Runs on every event before it is sent.
export const scrubEvent = (event) => {
  // A user id is enough to find the person internally; their name and email
  // are not needed to debug a stack trace.
  if (event.user) {
    event.user = { id: event.user.id };
  }

  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }
    if (event.request.data) event.request.data = scrub(event.request.data);
    if (event.request.query_string) event.request.query_string = scrub(event.request.query_string);
    if (event.request.url) event.request.url = scrub(event.request.url);
  }

  if (event.extra) event.extra = scrub(event.extra);
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(crumb => ({ ...crumb, data: scrub(crumb.data) }));
  }

  if (event.message) event.message = scrub(event.message);

  for (const entry of event.exception?.values ?? []) {
    if (entry.value) entry.value = scrub(entry.value);
  }

  return event;
};

let enabled = false;

export const initMonitoring = () => {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    logger.info('SENTRY_DSN is not set; error monitoring is off');
    return false;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.APP_VERSION || undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    // Belt and braces: the SDK is told not to collect PII, and every event is
    // scrubbed on the way out regardless.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: (crumb) => ({ ...crumb, data: scrub(crumb.data) }),
  });

  enabled = true;
  logger.info('Error monitoring enabled');
  return true;
};

export const reportError = (error, context = {}) => {
  if (!enabled) return;

  Sentry.withScope((scope) => {
    scope.setTag('requestId', context.requestId ?? 'unknown');
    if (context.userId) scope.setUser({ id: context.userId });
    scope.setExtras(scrub({ method: context.method, url: context.url }));
    Sentry.captureException(error);
  });
};

export const isMonitoringEnabled = () => enabled;
