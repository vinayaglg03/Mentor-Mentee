import { z } from 'zod';
import { uuid, studentIdParam, intInRange } from './common.js';

const count = z.coerce.number().int().min(0).max(1000);

export const bulkAttendanceSchema = {
  body: z.object({
    subjectId: uuid,
    semester: intInRange(1, 12),
    academicYear: intInRange(1900, 2200),
    asOfDate: z.coerce.date().optional(),
    rows: z.array(z.object({
      studentId: uuid,
      classesHeld: count,
      classesAttended: count,
    })).min(1, 'at least one row is required').max(500),
  })
};

export const classAttendanceSchema = {
  query: z.object({
    department: z.string().trim().min(1),
    semester: intInRange(1, 12),
    academicYear: intInRange(1900, 2200),
    subjectId: uuid,
  })
};

export const studentAttendanceSchema = {
  params: studentIdParam
};
