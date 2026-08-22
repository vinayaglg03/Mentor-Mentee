# AMIS runbook

What to do when something goes wrong, written to be followed under pressure by
somebody who did not write the code.

Every command assumes you are in the repository root unless it says otherwise.

---

## 1. Is it actually broken?

```bash
curl -s https://your-api-host/api/health | jq
```

| Response | Meaning | Do this |
|---|---|---|
| `200` with `"status":"ok"` | The API is up and can reach the database | The problem is elsewhere — check the browser console and the frontend host |
| `503` with `checks.database.ok: false` | The API is up, the database is not | Go to [database is unreachable](#4-database-is-unreachable) |
| Connection refused / timeout | The API process is not running or is asleep | Go to [the app is asleep](#2-the-app-is-asleep-free-tier-hosting) |

```bash
curl -s https://your-api-host/api/ready | jq
```

`ready: false` with `checks.migrations.ok: false` means the container started
against a database whose schema is older than the build. See
[a deploy went wrong](#5-a-deploy-went-wrong).

**Every error response carries a `requestId`**, and it is also in the
`X-Request-Id` header. When a faculty member reports a problem, ask them for
that reference and search the logs for it:

```bash
# Render
render logs --service amis-api --text <requestId>
# Docker
docker compose logs api | grep <requestId>
```

---

## 2. The app is asleep (free-tier hosting)

On Render's free tier the service is suspended after 15 minutes of inactivity
and the next request pays a **cold start of roughly 50 seconds**. On a Monday
morning that reads as "the system is broken", and faculty stop trying.

Fix it properly: move to a paid instance (Render Starter, currently $7/month
per service).

If it has to stay free for now, keep it warm:

```bash
# Any external cron (cron-job.org, GitHub Actions, UptimeRobot), every 10 min
curl -fsS https://your-api-host/api/health > /dev/null
```

This is a workaround, not a fix — a keep-alive ping still fails after a
deploy or a platform restart, and free instances are also memory-capped.

---

## 3. Restore from backup

**Test this before you need it.** A backup nobody has restored is a hope, not
a backup.

### Managed Postgres (Neon, Render, Supabase, RDS)

All of them keep automated daily backups with point-in-time recovery. The
console flow is the same shape everywhere:

1. Open the database → **Backups** / **Point in time**.
2. Restore to a **new** database, never over the live one. You want the old
   one intact while you check the new one.
3. Point a staging deploy at the restored URL and confirm the data:

```bash
DATABASE_URL="postgresql://.../restored" npx prisma migrate status
DATABASE_URL="postgresql://.../restored" node -e "import('./backend/src/prismaClient.js').then(async ({default:p})=>{console.log('students', await p.student.count());console.log('scores', await p.score.count());await p.\$disconnect();})"
```

4. Only then switch `DATABASE_URL` on the live service and redeploy.

### Self-hosted (docker compose)

Backups are written by the `backup` service to `./backups`:

```bash
# Take one now
docker compose exec -T postgres pg_dump -U amis -Fc amis > backups/manual-$(date +%F-%H%M).dump

# List what you have
ls -lh backups/

# Restore into a fresh database
docker compose exec -T postgres createdb -U amis amis_restored
docker compose exec -T postgres pg_restore -U amis -d amis_restored --clean --if-exists < backups/<file>.dump

# Check it, then point the app at it in .env and restart
docker compose restart api
```

### Restore drill (do this quarterly, and record the date here)

1. Restore yesterday's backup into `amis_restore_test`.
2. Run `npx prisma migrate status` against it — expect "up to date".
3. Count students, scores and audit entries; compare with production.
4. Drop the restore database.
5. Write the date and the row counts in the table below.

| Date | Backup used | Students | Scores | Restored in | By |
|---|---|---|---|---|---|
| _(record your first drill here)_ | | | | | |

---

## 4. Database is unreachable

1. Check the provider's status page.
2. Check the connection limit — a serverless Postgres will refuse new
   connections long before it goes down:

```sql
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
```

3. If connections are exhausted, restart the API to drop its pool, then
   reduce concurrency or move to a pooled connection string.
4. `Can't reach database server` in the logs with everything else healthy
   usually means the managed instance scaled to zero. The first request after
   that wakes it; the second normally succeeds.

---

## 5. A deploy went wrong

### Roll back the application

```bash
# Render: redeploy the previous successful deploy from the dashboard
# Docker:
docker compose pull && docker compose up -d --force-recreate
git checkout <previous-tag> && docker compose up -d --build
```

The application is safe to roll back **as long as the schema is compatible**.
Migrations in this project are additive by convention: new columns are
nullable or defaulted, and columns being retired are marked `@deprecated` for
one release before removal. That means the previous build almost always runs
against the newer schema.

### Roll back a migration

Prisma does not generate down-migrations. To reverse one:

1. Restore the database from the most recent backup taken **before** the
   deploy (section 3), or
2. Write a corrective migration forward:

```bash
cd backend
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_revert_x
# hand-write the reversing SQL, then
npx prisma migrate deploy
```

Never edit a migration that has already run anywhere. Prisma records a
checksum, and changing the file makes every future deploy fail.

### A migration is stuck half-applied

```bash
npx prisma migrate status
# If one is recorded as failed:
npx prisma migrate resolve --rolled-back <migration_name>
# Fix the SQL, then
npx prisma migrate deploy
```

---

## 6. Rotate secrets

Do this on a schedule, and immediately if a laptop or a `.env` file goes
missing.

### `JWT_SECRET`

Rotating it invalidates every access token immediately. Refresh cookies
survive, so users get a new access token silently within 15 minutes; the
visible effect is minimal.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Set JWT_SECRET on the host, then restart
```

To force everybody to sign in again, also clear the session table:

```sql
DELETE FROM "RefreshToken";
```

### Database password

1. Create the new password in the provider console (most allow two for a
   window).
2. Update `DATABASE_URL` on the API service and restart.
3. Confirm `/api/health` is `ok`.
4. Revoke the old password.

### Google OAuth client secret

1. Google Cloud console → Credentials → your OAuth client → **Add secret**.
2. Set `GOOGLE_CLIENT_SECRET` to the new value and restart.
3. Sign in once to confirm.
4. Delete the old secret in the console.

Sign-in is down between steps 1 and 3 if you delete the old secret first —
don't.

### Anything that leaks in a screenshot or a log

Assume it is public. Rotate it, then check the audit log for anything done
with it:

```
GET /api/audit?from=<when it leaked>&limit=200
```

---

## 7. Routine jobs

These run in-process by default (`NOTIFICATIONS_SCHEDULE=true`). With more
than one instance, set it to `false` and run them externally instead:

| Job | Command | When |
|---|---|---|
| Mentor digests | `npm run job:digest -- daily` | 01:30 daily |
| Weekly digests and HOD escalation | `npm run job:digest -- weekly` | 02:00 Mondays |
| Inactivity sweep | `npm run job:inactivity` | 03:00 daily |
| Audit retention | `npm run job:prune-audit` | Monthly |
| GPA backfill (after a grade scale change) | `npm run job:backfill-gpa` | On demand |

Each is an ordinary script with no dependency on the running server, so it is
safe to run by hand while the app is up.

---

## 8. Performance

If the dashboards get slow, check the analytics queries against a realistic
dataset before optimising anything:

```bash
createdb amis_perf
DATABASE_URL=postgresql://.../amis_perf npx prisma migrate deploy
DATABASE_URL=postgresql://.../amis_perf npm run perf:analytics
```

At 3,000 students and 18,000 scores every query should be well under a
second. If one is not, get the plan:

```sql
EXPLAIN ANALYZE <the query from src/lib/analyticsQueries.js>;
```

A sequential scan on `Student` or `Score` usually means an index was dropped
in a migration.
