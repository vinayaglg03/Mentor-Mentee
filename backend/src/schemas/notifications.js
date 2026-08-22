import { z } from 'zod';

const frequency = z.enum(['DAILY', 'WEEKLY', 'OFF']);

export const setPreferencesSchema = {
  body: z.object({ digestFrequency: frequency })
};

export const unsubscribeSchema = {
  body: z.object({
    token: z.string().trim().min(16).max(128),
    digestFrequency: frequency.optional(),
  })
};
