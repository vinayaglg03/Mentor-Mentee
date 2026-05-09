import express from 'express';
import { getAllStudents, getStudentById, createStudent, updateStudent, deleteStudent, assignMentor } from '../controllers/students.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken); // Protect all student routes

router.get('/', getAllStudents);
router.get('/:id', getStudentById);
router.post('/', requireRole(['ADMIN', 'MENTOR']), createStudent); 
router.put('/:id', requireRole(['ADMIN', 'MENTOR']), updateStudent);
router.delete('/:id', requireRole('ADMIN'), deleteStudent);
router.put('/assign-mentor', requireRole('ADMIN'), assignMentor);

export default router;
