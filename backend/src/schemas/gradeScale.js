import { z } from 'zod';

export const gradeScaleSchema = {
  body: z.object({
    bands: z.array(z.object({
      label: z.string().trim().min(1).max(4),
      minScore: z.coerce.number().min(0).max(100),
      gradePoint: z.coerce.number().min(0).max(10),
    }))
      .min(1, 'at least one band is required')
      .max(20)
      // Without a band starting at 0 a low score would have no grade at all.
      .refine(bands => bands.some(band => band.minScore === 0), {
        message: 'One band must start at 0 so every score maps to a grade',
      })
      .refine(bands => new Set(bands.map(band => band.label)).size === bands.length, {
        message: 'Band labels must be unique',
      }),
  })
};
