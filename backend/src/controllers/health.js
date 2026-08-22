import prisma from '../prismaClient.js';
import config from '../config.js';

// A health check that only proves Node is running tells you nothing useful:
// the failure that matters is the database being unreachable.
const checkDatabase = async () => {
  const started = Date.now();

  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - started, error: error.message.split('\n')[0] };
  }
};

const version = process.env.APP_VERSION || process.env.RENDER_GIT_COMMIT || 'dev';

export const health = async (req, res) => {
  const database = await checkDatabase();
  const status = database.ok ? 'ok' : 'degraded';

  res.status(database.ok ? 200 : 503).json({
    status,
    version,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: { database },
  });
};

// For deployment gating: a load balancer should not send traffic here until
// migrations have been applied and the schema is the one this build expects.
export const ready = async (req, res) => {
  const database = await checkDatabase();

  let migrations = { ok: false };

  if (database.ok) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        'SELECT "migration_name", "finished_at" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL ORDER BY "finished_at" DESC LIMIT 1'
      );
      const pending = await prisma.$queryRawUnsafe(
        'SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE "finished_at" IS NULL'
      );

      migrations = {
        ok: pending[0].count === 0,
        latest: rows[0]?.migration_name ?? null,
        unfinished: pending[0].count,
      };
    } catch (error) {
      migrations = { ok: false, error: error.message.split('\n')[0] };
    }
  }

  const ready = database.ok && migrations.ok;

  res.status(ready ? 200 : 503).json({
    ready,
    version,
    checks: { database, migrations },
    // Handy when a deploy misbehaves and somebody is comparing environments.
    mailDriver: config.mail.driver,
    scheduler: config.notifications.scheduleEnabled,
  });
};
