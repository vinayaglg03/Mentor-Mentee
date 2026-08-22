import express from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listAudit, studentActivity } from '../controllers/audit.js';
import { listAuditSchema, studentActivitySchema } from '../schemas/audit.js';

const router = express.Router();

router.use(authenticateToken);

// The log itself is HOD and above; a student's own history follows the
// ordinary student access rules so a mentor can see their mentee's.
router.get('/', requirePermission('audit:read'), validate(listAuditSchema), listAudit);
router.get('/student/:studentId', validate(studentActivitySchema), studentActivity);

export default router;
