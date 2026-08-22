import express from 'express';
import { submitScore, submitScoresBulk, getStudentScores, getClassScores } from '../controllers/scores.js';
import { authenticateToken, requireRoleAtLeast } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { submitScoreSchema, bulkScoreSchema, classScoresSchema, studentScoresSchema } from '../schemas/scores.js';

const router = express.Router();

router.use(authenticateToken); // Protect routes

router.post('/', requireRoleAtLeast('MENTOR'), validate(submitScoreSchema), submitScore);
router.post('/bulk', requireRoleAtLeast('MENTOR'), validate(bulkScoreSchema), submitScoresBulk);
router.get('/class', requireRoleAtLeast('MENTOR'), validate(classScoresSchema), getClassScores);
router.get('/:studentId', validate(studentScoresSchema), getStudentScores);

export default router;
