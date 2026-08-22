import express from 'express';
import { submitAttendanceBulk, getClassAttendance, getStudentAttendance } from '../controllers/attendance.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { bulkAttendanceSchema, classAttendanceSchema, studentAttendanceSchema } from '../schemas/attendance.js';

const router = express.Router();

router.use(authenticateToken);

router.post('/bulk', requireRole(['MENTOR', 'ADMIN']), validate(bulkAttendanceSchema), submitAttendanceBulk);
router.get('/class', requireRole(['MENTOR', 'ADMIN']), validate(classAttendanceSchema), getClassAttendance);
router.get('/student/:studentId', validate(studentAttendanceSchema), getStudentAttendance);

export default router;
