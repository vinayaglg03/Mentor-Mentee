import express from 'express';
import { getHODAnalytics } from '../controllers/analytics.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/hod', requirePermission('analytics:read'), getHODAnalytics);

export default router;
