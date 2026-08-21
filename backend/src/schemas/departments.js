import { z } from 'zod';
import { uuid } from './common.js';

export const createDepartmentSchema = {
  body: z.object({
    code: z.string().trim().min(2).max(12),
    name: z.string().trim().min(2).max(120).optional(),
  })
};

export const listBatchesSchema = {
  query: z.object({
    departmentId: uuid.optional(),
  })
};

export const createSectionSchema = {
  body: z.object({
    batchId: uuid,
    name: z.string().trim().min(1).max(8),
    coordinatorId: uuid.optional(),
  })
};
