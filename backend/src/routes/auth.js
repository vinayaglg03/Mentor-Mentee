import express from 'express';
import { register, login, me, createUser, getPendingUsers, approveUser } from '../controllers/auth.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticateToken, me);

// Admin-only user administration
router.post('/users', authenticateToken, requireRole('ADMIN'), createUser);
router.get('/users/pending', authenticateToken, requireRole('ADMIN'), getPendingUsers);
router.put('/users/:id/approve', authenticateToken, requireRole('ADMIN'), approveUser);

export default router;
