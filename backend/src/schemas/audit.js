import { z } from 'zod';
import { uuid, studentIdParam } from './common.js';

export const listAuditSchema = {
  query: z.object({
    entityType: z.string().trim().min(2).max(40).optional(),
    entityId: z.string().trim().min(1).max(64).optional(),
    actorId: uuid.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
};

export const studentActivitySchema = {
  params: studentIdParam
};
