import express from 'express';
import { getMentors, getAssignedStudents, getUnassignedStudents, addProgressLog, updateProgressLog, getFollowUps, getProgressLogs, claimStudent, addAchievement } from '../controllers/mentors.js';
import { needsAttention } from '../controllers/attention.js';
import { authenticateToken, requireRoleAtLeast } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { claimStudentSchema, addProgressLogSchema, updateProgressLogSchema, addAchievementSchema, progressLogsParamSchema } from '../schemas/mentors.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', requireRoleAtLeast('COORDINATOR'), getMentors);
router.get('/students', requireRoleAtLeast('MENTOR'), getAssignedStudents);
router.get('/students/unassigned', requireRoleAtLeast('MENTOR'), getUnassignedStudents);
router.put('/claim-student', requireRoleAtLeast('MENTOR'), validate(claimStudentSchema), claimStudent);
router.post('/logs', requireRoleAtLeast('MENTOR'), validate(addProgressLogSchema), addProgressLog);
router.get('/logs', requireRoleAtLeast('MENTOR'), getProgressLogs);
router.put('/logs/:id', requireRoleAtLeast('MENTOR'), validate(updateProgressLogSchema), updateProgressLog);
router.get('/follow-ups', requireRoleAtLeast('MENTOR'), getFollowUps);
// What to look at first: open high alerts, quiet mentees, follow-ups due.
router.get('/attention', requireRoleAtLeast('MENTOR'), needsAttention);
router.get('/logs/:studentId', validate(progressLogsParamSchema), getProgressLogs);
router.post('/achievements', requireRoleAtLeast('MENTOR'), validate(addAchievementSchema), addAchievement);

export default router;
