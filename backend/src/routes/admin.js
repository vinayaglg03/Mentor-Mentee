import express from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { runInactivityCheck } from '../jobs/inactivityCheck.js';
import { backfillGpa } from '../jobs/backfillGpa.js';
import { getGradeScale, replaceGradeScale } from '../controllers/gradeScale.js';
import { validate } from '../middleware/validate.js';
import { gradeScaleSchema } from '../schemas/gradeScale.js';

const router = express.Router();

router.use(authenticateToken, requirePermission('analytics:read'));

router.post('/jobs/inactivity-check', async (req, res, next) => {
  try {
    const result = await runInactivityCheck();
    res.json({ message: 'Inactivity check complete', ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/jobs/backfill-gpa', async (req, res, next) => {
  try {
    const result = await backfillGpa();
    res.json({ message: 'GPA backfill complete', ...result });
  } catch (error) {
    next(error);
  }
});

router.get('/grade-scale', getGradeScale);
router.put('/grade-scale', validate(gradeScaleSchema), replaceGradeScale);

export default router;
