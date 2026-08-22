import prisma from '../prismaClient.js';
import config from '../config.js';
import { pruneExpiredTokens } from '../lib/sessions.js';
import { pruneAudit } from './pruneAudit.js';

// Implements what docs/PRIVACY.md promises, rather than leaving the policy as
// a document nobody enforces.
//
// Student academic records are NOT deleted automatically. A college has
// statutory reasons to keep them, the right retention period differs between
// institutions, and quietly destroying a graduate's transcript would be worse
// than keeping it a year too long. This job reports what is past its window
// and deletes only when told to.

export const retentionReport = async () => {
  const graduatedCutoff = new Date();
  graduatedCutoff.setFullYear(graduatedCutoff.getFullYear() - config.retention.graduatedStudentYears);

  const auditCutoff = new Date();
  auditCutoff.setFullYear(auditCutoff.getFullYear() - config.retention.auditYears);

  const [graduated, auditEntries, expiredTokens, stalePendingImports] = await Promise.all([
    prisma.student.count({
      where: { status: { in: ['GRADUATED', 'TRANSFERRED', 'DROPPED'] }, updatedAt: { lt: graduatedCutoff } },
    }),
    prisma.auditLog.count({ where: { createdAt: { lt: auditCutoff } } }),
    prisma.refreshToken.count({ where: { expiresAt: { lt: new Date() } } }),
    prisma.pendingImport.count({ where: { expiresAt: { lt: new Date() } } }),
  ]);

  return {
    policy: {
      graduatedStudentYears: config.retention.graduatedStudentYears,
      auditYears: config.retention.auditYears,
    },
    cutoffs: { graduatedCutoff, auditCutoff },
    pastRetention: { graduatedStudents: graduated, auditEntries, expiredTokens, stalePendingImports },
  };
};

// The parts that are safe to remove without a human deciding: expired
// sessions, abandoned import staging rows, and audit entries past their
// documented window (archived first by pruneAudit).
export const runRetention = async ({ includeAudit = true } = {}) => {
  const report = await retentionReport();

  const tokens = await pruneExpiredTokens();
  const imports = await prisma.pendingImport.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const audit = includeAudit ? await pruneAudit() : { archived: 0 };

  return {
    ...report,
    removed: {
      expiredTokens: tokens.count,
      stalePendingImports: imports.count,
      auditEntriesArchived: audit.archived ?? 0,
    },
  };
};

// `npm run job:retention` reports; `-- --apply` also prunes.
if (process.argv[1] && process.argv[1].endsWith('retention.js')) {
  const apply = process.argv.includes('--apply');

  (apply ? runRetention() : retentionReport())
    .then(result => {
      console.log('\nRetention policy');
      console.log(`  Audit log:            ${result.policy.auditYears} years`);
      console.log(`  Former students:      ${result.policy.graduatedStudentYears} years (reported, never deleted automatically)`);
      console.log('\nPast their window right now');
      console.log(`  Former student records: ${result.pastRetention.graduatedStudents}`);
      console.log(`  Audit entries:          ${result.pastRetention.auditEntries}`);
      console.log(`  Expired sessions:       ${result.pastRetention.expiredTokens}`);
      console.log(`  Abandoned imports:      ${result.pastRetention.stalePendingImports}`);

      if (apply) {
        console.log('\nRemoved');
        console.log(`  Expired sessions:  ${result.removed.expiredTokens}`);
        console.log(`  Abandoned imports: ${result.removed.stalePendingImports}`);
        console.log(`  Audit entries archived and pruned: ${result.removed.auditEntriesArchived}`);
        console.log('\nFormer student records were not touched. Erase one deliberately with');
        console.log('DELETE /api/privacy/students/:id, which asks for the roll number as confirmation.');
      } else {
        console.log('\nNothing was changed. Re-run with --apply to prune sessions, imports and the audit log.');
      }
    })
    .catch(error => {
      console.error('Retention job failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
