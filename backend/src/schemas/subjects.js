import { z } from 'zod';
import { idParam, intInRange, requiredText } from './common.js';

const subjectFields = {
  name: requiredText('Subject name', 200),
  code: requiredText('Subject code', 40),
  department: requiredText('Department', 120),
  academicYear: intInRange(1900, 2200),
  semester: intInRange(1, 12),
};

export const createSubjectSchema = {
  body: z.object(subjectFields)
};

export const updateSubjectSchema = {
  params: idParam,
  body: z.object(subjectFields).partial()
};
