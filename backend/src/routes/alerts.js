import express from 'express';
import { getStudentAlerts, getMentorAlerts, getAllAlerts, resolveAlert } from '../controllers/alerts.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { resolveAlertSchema, studentAlertsSchema } from '../schemas/alerts.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/student/:studentId', validate(studentAlertsSchema), getStudentAlerts);
router.get('/mentor', requireRole(['MENTOR', 'ADMIN']), getMentorAlerts);
router.get('/all', requireRole('ADMIN'), getAllAlerts);
router.put('/:id/resolve', validate(resolveAlertSchema), resolveAlert);

export default router;
