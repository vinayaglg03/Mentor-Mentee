import express from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, me, createUser, getPendingUsers, approveUser, setUserDepartment, setUserRole } from '../controllers/auth.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema, createUserSchema, approveUserSchema, setUserDepartmentSchema, setUserRoleSchema } from '../schemas/auth.js';

const router = express.Router();

// Credential endpoints are the ones worth brute-forcing, so they get a cap.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  // The test suite hits these endpoints repeatedly from one address.
  skip: () => process.env.NODE_ENV === 'test',
});

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.get('/me', authenticateToken, me);

// Admin-only user administration
router.post('/users', authenticateToken, requirePermission('user:manage'), validate(createUserSchema), createUser);
router.get('/users/pending', authenticateToken, requirePermission('user:manage'), getPendingUsers);
router.put('/users/:id/approve', authenticateToken, requirePermission('user:manage'), validate(approveUserSchema), approveUser);
router.put('/users/:id/department', authenticateToken, requirePermission('user:role'), validate(setUserDepartmentSchema), setUserDepartment);
router.put('/users/:id/role', authenticateToken, requirePermission('user:role'), validate(setUserRoleSchema), setUserRole);

export default router;
