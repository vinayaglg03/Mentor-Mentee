import { AsyncLocalStorage } from 'node:async_hooks';

// Who is making the current request. Set once by the auth middleware and read
// by the Prisma extension, so controllers never have to pass an actor around
// or remember to log anything.
export const actorContext = new AsyncLocalStorage();

export const withActor = (actor, fn) => actorContext.run(actor, fn);

export const currentActor = () => actorContext.getStore() ?? null;

// Models whose writes are worth keeping a history of. Everything else (import
// staging rows, grade bands, generated alerts) is noise in an audit trail.
export const AUDITED_MODELS = new Set([
  'Student',
  'Score',
  'Attendance',
  'ProgressLog',
  'Alert',
  'User',
  'Subject',
  'Department',
  'Section',
  'SemesterRollover',
]);

export const WRITE_OPERATIONS = new Set([
  'create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany',
]);

// Never store these, whatever model they turn up on.
const REDACTED = new Set(['password', 'token', 'refreshToken']);

export const redact = (value) => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      REDACTED.has(key) ? '[redacted]' : redact(entry),
    ])
  );
};

// "Score updated", "Student status changed" - the action names that end up in
// the log and, in plainer words, on the student's activity tab.
export const actionFor = (model, operation) => {
  if (operation === 'upsert') return `${model}.upsert`;
  if (operation === 'createMany') return `${model}.createMany`;
  if (operation === 'deleteMany') return `${model}.deleteMany`;
  if (operation === 'updateMany') return `${model}.updateMany`;
  return `${model}.${operation}`;
};

// Only the fields that actually changed, so a diff is readable rather than a
// dump of every column.
export const changedFields = (before, after) => {
  if (!before || !after) return null;

  const changes = {};
  for (const [key, value] of Object.entries(after)) {
    const previous = before[key];
    const same = previous instanceof Date && value instanceof Date
      ? previous.getTime() === value.getTime()
      : JSON.stringify(previous) === JSON.stringify(value);

    if (!same) changes[key] = { from: redact(previous), to: redact(value) };
  }

  return Object.keys(changes).length > 0 ? changes : null;
};
