import { z } from 'zod';
import { uuid, studentIdParam } from './common.js';

export const assignStudentSchema = {
  params: studentIdParam,
  body: z.object({
    mentorId: z.union([uuid, z.null()]).optional(),
  })
};
