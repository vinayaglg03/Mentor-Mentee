import { z } from 'zod';
import { uuid, studentIdParam, intInRange } from './common.js';

// Marks are bounded here; the per-semester caps (50 vs 25) are enforced in
// the controller because they depend on the semester being submitted.
const mark = z.coerce.number().min(0).max(100);

export const submitScoreSchema = {
  body: z.object({
    studentId: uuid,
    subjectId: uuid,
    test1: mark.optional(),
    test2: mark.optional(),
    assignment: mark.optional(),
    exam: mark.nullish(),
    academicYear: intInRange(1900, 2200),
    semester: intInRange(1, 12),
  })
};

export const studentScoresSchema = {
  params: studentIdParam
};
