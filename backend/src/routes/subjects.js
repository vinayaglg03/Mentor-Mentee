import express from 'express';
import { createSubject, getSubjects, updateSubject, deleteSubject } from '../controllers/subjects.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createSubjectSchema, updateSubjectSchema } from '../schemas/subjects.js';

const router = express.Router();

router.use(authenticateToken);

router.post('/', requireRole(['MENTOR', 'ADMIN']), validate(createSubjectSchema), createSubject);
router.put('/:id', requireRole(['MENTOR', 'ADMIN']), validate(updateSubjectSchema), updateSubject);
router.delete('/:id', requireRole('ADMIN'), deleteSubject);
router.get('/', getSubjects);

export default router;
