import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { ForbiddenError, atLeast } from '../access.js';
import { ensureDepartment, normaliseCode } from '../departments.js';

export const columns = [
  { key: 'name', header: 'Name', required: true, example: 'Dr. Meera Nair' },
  { key: 'email', header: 'Email', required: true, example: 'meera.nair@college.edu.in' },
  { key: 'role', header: 'Role', required: false, example: 'MENTOR' },
  { key: 'department', header: 'Department', required: false, example: 'CSE' },
  { key: 'maxStudents', header: 'Max Students', required: false, example: 30 },
];

export const previewExtras = [
  { key: 'signIn', header: 'Signs in with' },
];

export const instructions = [
  'One faculty member per row. Email must be their college Google account.',
  'Role is MENTOR, COORDINATOR or HOD. Blank means MENTOR.',
  'Only a super admin can import HOD rows.',
  'Department is the code, e.g. CSE. Blank means unassigned, and they will see nothing until placed.',
  'Max Students is the mentee cap, default 30.',
  'Imported accounts are approved and sign in with Google; no passwords are created or sent.',
  'A row whose email already exists updates that account rather than duplicating it.',
];

const ROLES = ['SUPER_ADMIN', 'HOD', 'COORDINATOR', 'MENTOR'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const asInt = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
};

export const validate = async ({ rows, user, prisma }) => {
  const emails = rows.map(r => String(r.values.email ?? '').trim().toLowerCase()).filter(Boolean);

  const existing = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true, role: true, departmentId: true },
  });
  const byEmail = new Map(existing.map(row => [row.email.toLowerCase(), row]));

  const seen = new Map();
  const errors = [];
  const prepared = [];

  for (const { rowNumber, values } of rows) {
    const rowErrors = [];
    const add = (column, message) => rowErrors.push({ rowNumber, column, message });

    const name = String(values.name ?? '').trim();
    const email = String(values.email ?? '').trim().toLowerCase();
    const role = String(values.role ?? '').trim().toUpperCase() || 'MENTOR';
    const department = String(values.department ?? '').trim();
    const maxStudents = asInt(values.maxStudents) ?? 30;

    if (!name) add('Name', 'Name is required.');

    if (!email) {
      add('Email', 'Email is required.');
    } else if (!EMAIL.test(email)) {
      add('Email', 'Email is not a valid address.');
    } else {
      const duplicateRow = seen.get(email);
      if (duplicateRow) {
        add('Email', `Duplicate Email, already used on row ${duplicateRow}.`);
      } else {
        seen.set(email, rowNumber);
      }
    }

    if (!ROLES.includes(role)) {
      add('Role', `Role must be one of ${ROLES.join(', ')}.`);
    } else if ((role === 'HOD' || role === 'SUPER_ADMIN') && user.role !== 'SUPER_ADMIN') {
      add('Role', 'Only a super admin can import that role.');
    } else if (!atLeast(user, 'HOD')) {
      add('Role', 'Only a HOD or above can import faculty.');
    }

    if (maxStudents < 1 || maxStudents > 500) {
      add('Max Students', 'Max Students must be between 1 and 500.');
    }

    errors.push(...rowErrors);

    prepared.push({
      rowNumber,
      action: rowErrors.length > 0 ? 'invalid' : byEmail.has(email) ? 'update' : 'create',
      data: { name, email, role, department: department ? normaliseCode(department) : null, maxStudents },
      display: { name, email, role, department, maxStudents, signIn: 'Google' },
    });
  }

  return { rows: prepared, errors };
};

export const commit = async ({ rows, user, tx }) => {
  if (!atLeast(user, 'HOD')) {
    throw new ForbiddenError('Only a HOD or above can import faculty.');
  }

  let created = 0;
  let updated = 0;
  const departments = new Map();

  for (const row of rows) {
    const { data } = row;

    let departmentId = null;
    if (data.department) {
      if (!departments.has(data.department)) {
        departments.set(data.department, await ensureDepartment(tx, data.department));
      }
      departmentId = departments.get(data.department).id;
    }

    const existing = await tx.user.findUnique({ where: { email: data.email } });

    if (existing) {
      await tx.user.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          role: data.role,
          maxStudents: data.maxStudents,
          approved: true,
          ...(departmentId ? { departmentId } : {}),
        },
      });
      updated++;
    } else {
      await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          // No password: these accounts sign in with Google. A random one is
          // stored so nothing can be guessed if password login is ever
          // switched back on.
          password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
          role: data.role,
          maxStudents: data.maxStudents,
          departmentId,
          approved: true,
        },
      });
      created++;
    }
  }

  return { created, updated };
};
