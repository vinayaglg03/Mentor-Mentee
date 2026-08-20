import { z } from 'zod';
import { uuid } from './common.js';
import { importTypes } from '../lib/import/index.js';

const typeParam = z.object({
  type: z.enum(importTypes),
});

export const importTypeParamSchema = {
  params: typeParam,
};

export const commitImportSchema = {
  params: typeParam,
  body: z.object({
    importId: uuid,
  }),
};
