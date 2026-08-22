import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { authenticateToken, requireRoleAtLeast } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { exportStudent, eraseStudent, retentionPolicy } from '../controllers/privacy.js';
import { reportProblem } from '../controllers/support.js';
import { exportStudentSchema, eraseStudentSchema, reportProblemSchema } from '../schemas/privacy.js';

const router = express.Router();

// What the app promises about data, read from the running configuration so
// the page cannot drift from the deployment. Public: somebody deciding
// whether to sign in is entitled to read it first.
router.get('/retention', retentionPolicy);

// The changelog the app shows, served from the repository's release notes so
// there is one source of truth.
let changelogCache = null;

router.get('/changelog', (req, res, next) => {
  try {
    if (!changelogCache) {
      const file = path.resolve(process.cwd(), 'CHANGELOG.md');
      const fallback = path.resolve(process.cwd(), '..', 'CHANGELOG.md');
      const source = fs.existsSync(file) ? file : fallback;

      changelogCache = fs.existsSync(source)
        ? fs.readFileSync(source, 'utf8')
        : '# Changelog\n\nNo release notes have been published yet.\n';
    }

    res.type('text/markdown').send(changelogCache);
  } catch (error) {
    next(error);
  }
});

router.use(authenticateToken);

router.get('/students/:studentId/export', requireRoleAtLeast('MENTOR'), validate(exportStudentSchema), exportStudent);
router.delete('/students/:studentId', requireRoleAtLeast('HOD'), validate(eraseStudentSchema), eraseStudent);

router.post('/report-problem', requireRoleAtLeast('MENTOR'), validate(reportProblemSchema), reportProblem);

export default router;
