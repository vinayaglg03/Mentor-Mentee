import express from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, me, createUser, getPendingUsers, approveUser } from '../controllers/auth.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema, createUserSchema, approveUserSchema } from '../schemas/auth.js';

const router = express.Router();

// Credential endpoints are the ones worth brute-forcing, so they get a cap.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.get('/me', authenticateToken, me);

// Admin-only user administration
router.post('/users', authenticateToken, requireRole('ADMIN'), validate(createUserSchema), createUser);
router.get('/users/pending', authenticateToken, requireRole('ADMIN'), getPendingUsers);
router.put('/users/:id/approve', authenticateToken, requireRole('ADMIN'), validate(approveUserSchema), approveUser);

export default router;
