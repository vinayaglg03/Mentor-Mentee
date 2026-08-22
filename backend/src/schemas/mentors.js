import { z } from 'zod';
import { uuid, studentIdParam, requiredText, optionalText } from './common.js';

export const claimStudentSchema = {
  body: z.object({ studentId: uuid })
};

export const LOG_TYPES = ['ACADEMIC', 'ATTENDANCE', 'PERSONAL', 'CAREER', 'DISCIPLINARY', 'ROUTINE_MEETING'];
export const LOG_MODES = ['IN_PERSON', 'PHONE', 'EMAIL', 'ONLINE'];

export const addProgressLogSchema = {
  body: z.object({
    studentId: uuid.optional(),
    semesterRecordId: uuid.optional(),
    remark: requiredText('Remark', 2000),
    type: z.enum(LOG_TYPES).optional(),
    mode: z.enum(LOG_MODES).optional(),
    actionItems: optionalText(2000),
    followUpDate: z.coerce.date().optional().nullable(),
    // Set when this entry corrects an earlier one that can no longer be edited.
    correctsId: uuid.optional(),
  }).refine(v => v.studentId || v.semesterRecordId, {
    message: 'Either studentId or semesterRecordId is required',
    path: ['studentId'],
  })
};

export const updateProgressLogSchema = {
  params: z.object({ id: uuid }),
  body: z.object({
    remark: requiredText('Remark', 2000).optional(),
    type: z.enum(LOG_TYPES).optional(),
    mode: z.enum(LOG_MODES).optional(),
    actionItems: optionalText(2000),
    followUpDate: z.coerce.date().optional().nullable(),
    studentAcknowledged: z.boolean().optional(),
  })
};

export const addAchievementSchema = {
  body: z.object({
    studentId: uuid.optional(),
    semesterRecordId: uuid.optional(),
    title: requiredText('Title', 200),
    description: optionalText(),
  }).refine(v => v.studentId || v.semesterRecordId, {
    message: 'Either studentId or semesterRecordId is required',
    path: ['studentId'],
  })
};

export const progressLogsParamSchema = {
  params: studentIdParam
};
