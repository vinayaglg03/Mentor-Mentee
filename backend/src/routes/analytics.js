import express from 'express';
import { getHODAnalytics } from '../controllers/analytics.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/hod', requireRole('ADMIN'), getHODAnalytics);

export default router;
