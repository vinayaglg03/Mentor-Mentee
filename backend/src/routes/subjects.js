import express from 'express';
import { createSubject, getSubjects, updateSubject, deleteSubject } from '../controllers/subjects.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.post('/', requireRole(['MENTOR', 'ADMIN']), createSubject); 
router.put('/:id', requireRole(['MENTOR', 'ADMIN']), updateSubject);
router.delete('/:id', requireRole('ADMIN'), deleteSubject);
router.get('/', getSubjects);

export default router;
