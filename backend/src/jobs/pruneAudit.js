import fs from 'node:fs';
import path from 'node:path';
import { unauditedPrisma as prisma } from '../prismaClient.js';

// Retention policy: audit entries are kept for three years, which covers a
// full NBA/NAAC accreditation cycle plus the year it is reviewed in. Older
// entries are written to a JSONL archive file and only then deleted - the log
// is append-only in the application, and this job is the single exception.
export const RETENTION_YEARS = 3;

export const pruneAudit = async ({ archiveDir = 'archive/audit', dryRun = false } = {}) => {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);

  const total = await prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } });
  if (total === 0 || dryRun) return { cutoff, total, archived: 0, deleted: 0, dryRun };

  fs.mkdirSync(archiveDir, { recursive: true });
  const file = path.join(archiveDir, `audit-before-${cutoff.toISOString().slice(0, 10)}.jsonl`);
  const stream = fs.createWriteStream(file, { flags: 'a' });

  let archived = 0;
  const batchSize = 500;

  // Archived in batches so a long history does not have to fit in memory.
  for (;;) {
    const batch = await prisma.auditLog.findMany({
      where: { createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });

    if (batch.length === 0) break;

    for (const entry of batch) stream.write(`${JSON.stringify(entry)}\n`);
    archived += batch.length;

    await prisma.auditLog.deleteMany({ where: { id: { in: batch.map(entry => entry.id) } } });
  }

  await new Promise(resolve => stream.end(resolve));

  return { cutoff, total, archived, deleted: archived, file };
};

// `npm run job:prune-audit`
if (process.argv[1] && process.argv[1].endsWith('pruneAudit.js')) {
  pruneAudit({ dryRun: process.argv.includes('--dry-run') })
    .then(result => {
      if (result.dryRun) {
        console.log(`${result.total} entries are older than ${result.cutoff.toISOString().slice(0, 10)}. Nothing was removed.`);
        return;
      }
      console.log(
        result.archived === 0
          ? 'No audit entries are past the retention window.'
          : `Archived ${result.archived} entries to ${result.file} and removed them.`
      );
    })
    .catch(error => {
      console.error('Audit prune failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
