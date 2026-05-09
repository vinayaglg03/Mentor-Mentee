import express from 'express';
import { getMentors, getAssignedStudents, addProgressLog, getProgressLogs, claimStudent, addAchievement } from '../controllers/mentors.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', requireRole('ADMIN'), getMentors);
router.get('/students', requireRole(['MENTOR', 'ADMIN']), getAssignedStudents);
router.put('/claim-student', requireRole(['MENTOR', 'ADMIN']), claimStudent);
router.post('/logs', requireRole(['MENTOR', 'ADMIN']), addProgressLog);
router.get('/logs', requireRole(['MENTOR', 'ADMIN']), getProgressLogs);
router.get('/logs/:studentId', getProgressLogs);
router.post('/achievements', requireRole(['MENTOR', 'ADMIN']), addAchievement);

export default router;
