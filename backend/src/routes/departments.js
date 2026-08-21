import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listDepartments, createDepartment, listBatches, createSection } from '../controllers/departments.js';
import { createDepartmentSchema, listBatchesSchema, createSectionSchema } from '../schemas/departments.js';

const router = express.Router();

router.use(authenticateToken);

// Everyone signed in needs the list to populate department pickers.
router.get('/', listDepartments);
router.get('/batches', validate(listBatchesSchema), listBatches);

router.post('/', requireRole('ADMIN'), validate(createDepartmentSchema), createDepartment);
router.post('/sections', requireRole('ADMIN'), validate(createSectionSchema), createSection);

export default router;
