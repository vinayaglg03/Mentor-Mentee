import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { assignStudentSchema } from '../schemas/hod.js';
import { 
  getAllStudents,
  getUnassignedStudents,
  assignStudent,
  getAtRiskStudents,
  getTopPerformers,
  getMentors
} from '../controllers/hod.js';

const router = express.Router();

// Require completely authenticated Admin status for everything
router.use(authenticateToken, requireRole('ADMIN'));

router.get('/students', getAllStudents);
router.get('/students/unassigned', getUnassignedStudents);
router.put('/students/:studentId/assign', validate(assignStudentSchema), assignStudent);

router.get('/analytics/at-risk', getAtRiskStudents);
router.get('/analytics/top-performers', getTopPerformers);

router.get('/mentors', getMentors);

export default router;
