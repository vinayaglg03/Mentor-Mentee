import { z } from 'zod';
import { uuid, studentIdParam, requiredText, optionalText } from './common.js';

export const claimStudentSchema = {
  body: z.object({ studentId: uuid })
};

export const addProgressLogSchema = {
  body: z.object({
    studentId: uuid.optional(),
    semesterRecordId: uuid.optional(),
    remark: requiredText('Remark', 2000),
  }).refine(v => v.studentId || v.semesterRecordId, {
    message: 'Either studentId or semesterRecordId is required',
    path: ['studentId'],
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
