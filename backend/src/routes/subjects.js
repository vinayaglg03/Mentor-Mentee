import express from 'express';
import { createSubject, getSubjects, updateSubject, deleteSubject } from '../controllers/subjects.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createSubjectSchema, updateSubjectSchema } from '../schemas/subjects.js';

const router = express.Router();

router.use(authenticateToken);

router.post('/', requirePermission('subject:write'), validate(createSubjectSchema), createSubject);
router.put('/:id', requirePermission('subject:write'), validate(updateSubjectSchema), updateSubject);
router.delete('/:id', requirePermission('subject:write'), deleteSubject);
router.get('/', getSubjects);

export default router;
