import { z } from 'zod';

// Same pattern as the other schemas: reject early, with a message a person
// could act on, and never let an unknown key through to Prisma.

const currentYear = new Date().getFullYear();

export const updatePreferencesSchema = {
  body: z.object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    density: z.enum(['comfortable', 'compact']).optional(),
    // null hands the decision back to the operating system.
    reduceMotion: z.boolean().nullable().optional(),

    defaultDepartmentId: z.string().uuid('Not a department id.').nullable().optional(),
    defaultSemester: z.number().int().min(1).max(8).nullable().optional(),
    defaultAcademicYear: z.number().int()
      .min(2000, 'Academic year looks wrong.')
      .max(currentYear + 5, 'Academic year is too far ahead.')
      .nullable().optional(),

    notifyDailyDigest: z.boolean().optional(),
    notifyWeeklyDigest: z.boolean().optional(),
    notifyHighSeverity: z.boolean().optional(),
  })
    .strict()
    .refine(body => Object.keys(body).length > 0, {
      message: 'Nothing to update.',
    }),
};

export const updateInstitutionSchema = {
  body: z.object({
    name: z.string().trim().min(2, 'The institution needs a name.').max(200).optional(),
    shortName: z.string().trim().max(40).nullable().optional(),
    // Used in the header of every generated PDF report.
    logoUrl: z.string().trim().url('That is not a URL.').max(500).nullable().optional(),
    currentAcademicYear: z.number().int().min(2000).max(currentYear + 5).nullable().optional(),

    // Eligibility rules. Nobody's regulation puts these outside 0-100, and a
    // threshold of 0 would silently switch the alerts off.
    attendanceCritical: z.number().int()
      .min(1, 'A threshold of 0 would turn attendance alerts off.')
      .max(100).optional(),
    attendanceWarning: z.number().int().min(1).max(100).optional(),
    markConcernPercent: z.number().int().min(1).max(100).optional(),
  })
    .strict()
    .refine(body => Object.keys(body).length > 0, {
      message: 'Nothing to update.',
    }),
};
