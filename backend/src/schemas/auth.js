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
    role: z.enum(['SUPER_ADMIN', 'HOD', 'COORDINATOR', 'MENTOR']),
    departmentId: uuid.optional(),
  })
};

export const approveUserSchema = {
  params: z.object({ id: uuid }),
  body: z.object({
    // A HOD may hand out MENTOR and COORDINATOR; only a SUPER_ADMIN may
    // create another HOD, which the controller enforces.
    role: z.enum(['SUPER_ADMIN', 'HOD', 'COORDINATOR', 'MENTOR']).optional(),
    departmentId: uuid.optional(),
    sectionId: uuid.optional(),
  }).optional().default({})
};

export const setUserDepartmentSchema = {
  params: z.object({ id: uuid }),
  body: z.object({ departmentId: uuid.nullable() })
};

export const setUserRoleSchema = {
  params: z.object({ id: uuid }),
  body: z.object({
    role: z.enum(['SUPER_ADMIN', 'HOD', 'COORDINATOR', 'MENTOR']),
  })
};

export const changePasswordSchema = {
  body: z.object({
    currentPassword: z.string().min(1, 'is required'),
    // Same policy as registration; a weaker one here would be a way around it.
    newPassword: password,
  }).strict(),
};
