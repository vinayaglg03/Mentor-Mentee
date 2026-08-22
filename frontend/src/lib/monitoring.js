import * as Sentry from '@sentry/react';

// Optional: with no DSN this does nothing. What it must never do is send a
// student's name or email to a third party, so events are scrubbed here as
// well as being told not to collect PII.
const SENSITIVE_KEYS = ['password', 'token', 'email', 'name', 'rollnumber', 'phone', 'remark', 'actionitems'];
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const REDACTED = '[redacted]';

export const scrub = (value, depth = 0) => {
  if (depth > 6 || value === null || value === undefined) return value;
  if (typeof value === 'string') return value.replace(EMAIL_PATTERN, REDACTED);
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

export const initMonitoring = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.user) event.user = { id: event.user.id };
      if (event.request?.url) event.request.url = scrub(event.request.url);
      if (event.extra) event.extra = scrub(event.extra);
      if (event.message) event.message = scrub(event.message);
      for (const entry of event.exception?.values ?? []) {
        if (entry.value) entry.value = scrub(entry.value);
      }
      return event;
    },
    beforeBreadcrumb(crumb) {
      return { ...crumb, data: scrub(crumb.data), message: scrub(crumb.message) };
    },
  });

  return true;
};

export const setMonitoringUser = (user) => {
  // Id only: enough to find the person internally, nothing identifying.
  Sentry.setUser(user ? { id: user.id } : null);
};

export const reportToMonitoring = (error, context = {}) => {
  Sentry.captureException(error, { extra: scrub(context) });
};
