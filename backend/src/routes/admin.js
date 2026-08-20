import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { runInactivityCheck } from '../jobs/inactivityCheck.js';

const router = express.Router();

router.use(authenticateToken, requireRole('ADMIN'));

router.post('/jobs/inactivity-check', async (req, res, next) => {
  try {
    const result = await runInactivityCheck();
    res.json({ message: 'Inactivity check complete', ...result });
  } catch (error) {
    next(error);
  }
});

export default router;
