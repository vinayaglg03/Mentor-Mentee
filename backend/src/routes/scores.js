import express from 'express';
import { submitScore, submitScoresBulk, getStudentScores, getClassScores } from '../controllers/scores.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { submitScoreSchema, bulkScoreSchema, classScoresSchema, studentScoresSchema } from '../schemas/scores.js';

const router = express.Router();

router.use(authenticateToken); // Protect routes

router.post('/', requireRole(['MENTOR', 'ADMIN']), validate(submitScoreSchema), submitScore);
router.post('/bulk', requireRole(['MENTOR', 'ADMIN']), validate(bulkScoreSchema), submitScoresBulk);
router.get('/class', requireRole(['MENTOR', 'ADMIN']), validate(classScoresSchema), getClassScores);
router.get('/:studentId', validate(studentScoresSchema), getStudentScores);

export default router;
