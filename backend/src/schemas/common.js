import { z } from 'zod';

export const uuid = z.string().uuid('must be a valid id');

export const idParam = z.object({ id: uuid });
export const studentIdParam = z.object({ studentId: uuid });

// Form fields arrive as strings from the browser, so numbers are coerced.
export const intInRange = (min, max) =>
  z.coerce.number().int().min(min).max(max);

export const requiredText = (label, max = 200) =>
  z.string().trim().min(1, `${label} is required`).max(max);

export const optionalText = (max = 2000) =>
  z.string().trim().max(max).optional();
