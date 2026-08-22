import { z } from 'zod';
import { studentIdParam } from './common.js';

export const exportStudentSchema = { params: studentIdParam };

export const eraseStudentSchema = {
  params: studentIdParam,
  body: z.object({
    // Typing the roll number is the confirmation for an irreversible action.
    confirmRollNumber: z.string().trim().min(1),
  })
};

export const reportProblemSchema = {
  body: z.object({
    message: z.string().trim().min(5, 'Tell us what happened').max(4000),
    route: z.string().trim().max(300).optional(),
    requestId: z.string().trim().max(64).optional(),
    userAgent: z.string().trim().max(400).optional(),
    viewport: z.string().trim().max(40).optional(),
    appVersion: z.string().trim().max(60).optional(),
  })
};
