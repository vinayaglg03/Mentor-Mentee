import express from 'express';
import { submitScore, getStudentScores } from '../controllers/scores.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { submitScoreSchema, studentScoresSchema } from '../schemas/scores.js';

const router = express.Router();

router.use(authenticateToken); // Protect routes

router.post('/', requireRole(['MENTOR', 'ADMIN']), validate(submitScoreSchema), submitScore);
router.get('/:studentId', validate(studentScoresSchema), getStudentScores);

export default router;
