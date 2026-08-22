import { z } from 'zod';
import { uuid, intInRange } from './common.js';

export const saveInstitutionSchema = {
  body: z.object({
    name: z.string().trim().min(2).max(160),
    shortName: z.string().trim().max(40).optional().nullable(),
    logoUrl: z.string().trim().max(500).optional().nullable(),
    address: z.string().trim().max(300).optional().nullable(),
    academicYearStart: z.coerce.date().optional().nullable(),
    academicYearEnd: z.coerce.date().optional().nullable(),
    currentAcademicYear: intInRange(1900, 2200).optional(),
  })
};

export const setupStateSchema = {
  body: z.object({ setupState: z.record(z.string(), z.any()).optional() })
};

export const assignMentorsSchema = {
  body: z.object({
    departmentId: uuid.optional(),
    mentorIds: z.array(uuid).max(200).optional(),
    preview: z.boolean().optional(),
  })
};

export const assignToMentorSchema = {
  body: z.object({
    mentorId: uuid,
    studentIds: z.array(uuid).min(1).max(200),
  })
};
