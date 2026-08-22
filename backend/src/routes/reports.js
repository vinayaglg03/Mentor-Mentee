import express from 'express';
import { authenticateToken, requireRoleAtLeast } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { mentoringReport, classSummary, atRiskExport, marksSheetExport } from '../controllers/reports.js';
import { mentoringReportSchema, classSummarySchema, atRiskSchema, marksSheetSchema } from '../schemas/reports.js';

const router = express.Router();

// Every export is scoped in its controller: a MENTOR only ever gets their own
// mentees, an ADMIN gets the department.
router.use(authenticateToken, requireRoleAtLeast('MENTOR'));

router.get('/student/:studentId/mentoring.pdf', validate(mentoringReportSchema), mentoringReport);
router.get('/class-summary.pdf', validate(classSummarySchema), classSummary);
router.get('/at-risk.xlsx', validate(atRiskSchema), atRiskExport);
router.get('/marks-sheet.xlsx', validate(marksSheetSchema), marksSheetExport);

export default router;
