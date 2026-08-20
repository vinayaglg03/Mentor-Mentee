import { z } from 'zod';
import { uuid, requiredText } from './common.js';

const email = z.string().trim().toLowerCase().email('must be a valid email address');
const password = z.string().min(10, 'must be at least 10 characters').max(128);

export const registerSchema = {
  body: z.object({
    name: requiredText('Name', 120),
    email,
    password,
  })
};

export const loginSchema = {
  body: z.object({
    email,
    password: z.string().min(1, 'is required'),
  })
};

export const createUserSchema = {
  body: z.object({
    name: requiredText('Name', 120),
    email,
    password,
    role: z.enum(['MENTOR', 'ADMIN']),
  })
};

export const approveUserSchema = {
  params: z.object({ id: uuid })
};
