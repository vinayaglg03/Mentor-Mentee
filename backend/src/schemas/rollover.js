import { z } from 'zod';
import { uuid, intInRange } from './common.js';

export const batchIdParamSchema = {
  params: z.object({ id: uuid })
};

export const promoteBatchSchema = {
  params: z.object({ id: uuid }),
  body: z.object({
    // Taken from the preview; guards against promoting a batch that moved.
    fromSemester: intInRange(1, 12).optional(),
  })
};
