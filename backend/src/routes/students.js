import express from 'express';
import { getAllStudents, getStudentById, createStudent, updateStudent, deleteStudent } from '../controllers/students.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createStudentSchema, updateStudentSchema, studentIdParamSchema } from '../schemas/students.js';

const router = express.Router();

router.use(authenticateToken); // Protect all student routes

router.get('/', getAllStudents);
router.get('/:id', validate(studentIdParamSchema), getStudentById);
router.post('/', requireRole(['ADMIN', 'MENTOR']), validate(createStudentSchema), createStudent);
router.put('/:id', requireRole(['ADMIN', 'MENTOR']), validate(updateStudentSchema), updateStudent);
router.delete('/:id', requireRole('ADMIN'), validate(studentIdParamSchema), deleteStudent);

export default router;
