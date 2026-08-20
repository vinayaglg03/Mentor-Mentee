import express from 'express';
import { getMentors, getAssignedStudents, getUnassignedStudents, addProgressLog, getProgressLogs, claimStudent, addAchievement } from '../controllers/mentors.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { claimStudentSchema, addProgressLogSchema, addAchievementSchema, progressLogsParamSchema } from '../schemas/mentors.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', requireRole('ADMIN'), getMentors);
router.get('/students', requireRole(['MENTOR', 'ADMIN']), getAssignedStudents);
router.get('/students/unassigned', requireRole(['MENTOR', 'ADMIN']), getUnassignedStudents);
router.put('/claim-student', requireRole(['MENTOR', 'ADMIN']), validate(claimStudentSchema), claimStudent);
router.post('/logs', requireRole(['MENTOR', 'ADMIN']), validate(addProgressLogSchema), addProgressLog);
router.get('/logs', requireRole(['MENTOR', 'ADMIN']), getProgressLogs);
router.get('/logs/:studentId', validate(progressLogsParamSchema), getProgressLogs);
router.post('/achievements', requireRole(['MENTOR', 'ADMIN']), validate(addAchievementSchema), addAchievement);

export default router;
