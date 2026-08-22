import { z } from 'zod';
import { uuid, idParam, intInRange, requiredText } from './common.js';

const year = intInRange(1900, 2200);

const studentFields = {
  name: requiredText('Name', 120),
  rollNumber: requiredText('Roll number', 40),
  department: requiredText('Department', 120),
  currentYear: intInRange(1, 6),
  currentSemester: intInRange(1, 12),
  currentAcademicYear: year,
  enrollmentYear: year,
  email: z.union([z.string().trim().email(), z.literal(''), z.null()]).optional(),
  mentorId: z.union([uuid, z.literal(''), z.null()]).optional(),
};

export const createStudentSchema = {
  body: z.object(studentFields)
};

export const updateStudentSchema = {
  params: idParam,
  // Every field is optional on update; the handler ignores undefined values.
  body: z.object(studentFields).partial()
};

export const studentIdParamSchema = {
  params: idParam
};
