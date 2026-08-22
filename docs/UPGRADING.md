# Upgrading AMIS

## Versioning

AMIS uses `MAJOR.MINOR.PATCH`, and the release notes say which one you are
getting and what it means for you.

| Part | Changes when | What you have to do |
|---|---|---|
| **PATCH** (0.4.**1**) | A bug is fixed. No schema change, no configuration change. | Pull and restart. |
| **MINOR** (0.**4**.0) | A feature is added. The schema may gain columns or tables, always additively; new configuration is always optional with a working default. | Pull and restart. Read the release note for the new settings you may want. |
| **MAJOR** (**1**.0.0) | Something is removed or changes meaning: a column dropped, a default reversed, an endpoint retired. | Read the release note first. There will be a section headed "Before you upgrade". |

Two rules hold for every MINOR and PATCH release, and they are what make an
upgrade safe:

1. **Migrations are additive.** New columns are nullable or have a default.
   Nothing is dropped in the same release that stops using it — a column is
   marked deprecated for one MINOR release first, and removed in the next.
2. **The previous build runs against the new schema.** That is what makes a
   rollback possible: if the new version misbehaves, you can go back to the
   old container without touching the database.

## Before every upgrade

Take a backup. It takes seconds and it is the difference between an
inconvenience and a disaster.

```bash
cd /opt/amis
docker compose exec -T postgres pg_dump -U amis -Fc amis > backups/before-upgrade-$(date +%F-%H%M).dump
ls -lh backups/ | tail -3
```

**You should see** your new file, at least a few hundred kilobytes.

## The upgrade

```bash
git pull
docker compose up -d --build
```

**You should see** images rebuilding, then containers recreated. Migrations
run automatically as the API container starts.

Check it came up:

```bash
curl -s http://localhost/api/ready
```

**You should see** `{"ready":true,...,"migrations":{"ok":true,...}}`.

**If `ready` is false and `migrations.ok` is false:** a migration did not
finish. See [the runbook](runbook.md#a-migration-is-stuck-half-applied).

Then open the app and check one real thing — a mentor's dashboard, or a
student's profile. A green health check only proves the process started.

## Rolling back

If the new version misbehaves:

```bash
git log --oneline -5          # find the commit you were on
git checkout <previous-tag-or-commit>
docker compose up -d --build
```

Because migrations are additive, the older build runs against the newer
schema. You do **not** need to restore the database, and you should not: any
work done since the upgrade would be lost.

Restore the database only if a migration corrupted data. In that case, follow
[the runbook](runbook.md#3-restore-from-backup) and expect to lose everything
entered since the backup.

## After a MAJOR upgrade

Major releases may drop a deprecated column. Once you have upgraded and are
happy, there is no way back to the previous MAJOR without a restore — so keep
the pre-upgrade backup for at least a week.

## Zero-downtime upgrades

Not supported, and not worth engineering for a single college: the restart
takes a few seconds and the app reconnects by itself. Do it outside class
hours and nobody will notice.

## Keeping up

Watch the repository's releases page, or:

```bash
cd /opt/amis && git fetch && git log --oneline HEAD..origin/main
```

If that prints nothing, you are up to date.
