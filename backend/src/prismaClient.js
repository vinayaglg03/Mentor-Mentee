import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import config from './config.js';
import {
  currentActor, AUDITED_MODELS, WRITE_OPERATIONS, actionFor, redact, changedFields,
} from './lib/audit.js';

const { Pool } = pg;

// Set DATABASE_SSL=true if your host requires TLS (e.g. Neon, Supabase) and the URL has no sslmode.
const pool = new Pool({
  connectionString: config.databaseUrl,
  ...(config.databaseSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

const adapter = new PrismaPg(pool);

// The unextended client. Used to read the previous state of a row and to write
// the audit entries themselves - audit writes must not recurse through the
// extension.
const base = new PrismaClient({ adapter });

const modelDelegate = (model) => base[model.charAt(0).toLowerCase() + model.slice(1)];

// The row as it stands before an update or delete, so the log can show what
// actually changed rather than only the new values.
const readBefore = async (model, operation, args) => {
  if (!['update', 'delete', 'upsert'].includes(operation)) return null;
  if (!args?.where) return null;

  try {
    return await modelDelegate(model).findUnique({ where: args.where });
  } catch {
    // A composite or non-unique where clause is not worth failing a write over.
    return null;
  }
};

const idOf = (result, before) => {
  if (result && typeof result === 'object' && 'id' in result) return result.id;
  if (before && typeof before === 'object' && 'id' in before) return before.id;
  return null;
};

const writeEntry = async (entry) => {
  try {
    await base.auditLog.create({ data: entry });
  } catch (error) {
    // An audit failure must never take a legitimate write down with it; it is
    // logged and the request continues.
    console.error('Audit write failed:', error?.message ?? error);
  }
};

// Every write to an audited model is recorded centrally here, so no controller
// has to remember to log anything.
//
// One caveat worth knowing: inside an interactive transaction the entry is
// written on a separate connection, so a transaction that later rolls back can
// leave an entry describing a change that did not land. The log therefore
// over-records rather than under-records, which is the safer direction for an
// audit trail.
const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!AUDITED_MODELS.has(model) || !WRITE_OPERATIONS.has(operation)) {
          return query(args);
        }

        const before = await readBefore(model, operation, args);
        const result = await query(args);
        const actor = currentActor();

        const after = result && typeof result === 'object' && !Array.isArray(result) ? result : null;
        const changes = changedFields(before, after);

        await writeEntry({
          actorId: actor?.id ?? null,
          actorRole: actor?.role ?? null,
          action: actionFor(model, operation),
          entityType: model,
          entityId: idOf(after, before),
          before: before ? redact(before) : null,
          // For an update, the interesting part is the diff; for a create it is
          // the row itself.
          after: changes ?? (after ? redact(after) : redact(args?.data ?? null)),
          ip: actor?.ip ?? null,
          userAgent: actor?.userAgent ?? null,
        });

        return result;
      },
    },
  },
});

// Callers that must not be audited (the audit reader itself, the retention
// job) use this.
export { base as unauditedPrisma };

export default prisma;
