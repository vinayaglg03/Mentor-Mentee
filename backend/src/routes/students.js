import express from 'express';
import { getAllStudents, getStudentById, createStudent, updateStudent, deleteStudent } from '../controllers/students.js';
import { authenticateToken, requireRoleAtLeast, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createStudentSchema, updateStudentSchema, studentIdParamSchema } from '../schemas/students.js';

const router = express.Router();

router.use(authenticateToken); // Protect all student routes

router.get('/', getAllStudents);
router.get('/:id', validate(studentIdParamSchema), getStudentById);
router.post('/', requireRoleAtLeast('MENTOR'), validate(createStudentSchema), createStudent);
router.put('/:id', requireRoleAtLeast('MENTOR'), validate(updateStudentSchema), updateStudent);
router.delete('/:id', requirePermission('student:delete'), validate(studentIdParamSchema), deleteStudent);

export default router;
