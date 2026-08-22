import { z } from 'zod';
import { uuid, studentIdParam, intInRange } from './common.js';

export const mentoringReportSchema = {
  params: studentIdParam
};

export const classSummarySchema = {
  query: z.object({
    department: z.string().trim().min(1),
    semester: intInRange(1, 12),
    academicYear: intInRange(1900, 2200),
  })
};

export const atRiskSchema = {
  query: z.object({
    department: z.string().trim().min(1).optional(),
    semester: intInRange(1, 12).optional(),
  })
};

export const marksSheetSchema = {
  query: z.object({
    department: z.string().trim().min(1),
    semester: intInRange(1, 12),
    academicYear: intInRange(1900, 2200),
    subjectId: uuid,
  })
};
