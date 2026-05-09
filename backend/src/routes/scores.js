import express from 'express';
import { submitScore, getStudentScores } from '../controllers/scores.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken); // Protect routes

router.post('/', requireRole(['MENTOR', 'ADMIN']), submitScore);
router.get('/:studentId', getStudentScores);

export default router;
