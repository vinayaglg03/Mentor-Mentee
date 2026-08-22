import prisma from '../prismaClient.js';
import { NotFoundError } from './access.js';

export const normaliseCode = (value) => String(value ?? '').trim().toUpperCase();

// Callers may pass a department id or a code ("CSE"). Existing clients send
// the code, so both are accepted and resolved to a row here rather than in
// each controller.
export const findDepartment = async (identifier) => {
  if (!identifier) return null;

  const value = String(identifier);

  const byId = await prisma.department.findUnique({ where: { id: value } }).catch(() => null);
  if (byId) return byId;

  return prisma.department.findUnique({ where: { code: normaliseCode(value) } });
};

export const requireDepartment = async (identifier) => {
  const department = await findDepartment(identifier);
  if (!department) throw new NotFoundError(`No department matching "${identifier}".`);
  return department;
};

// Finds an existing department or creates it, used by the importers so a new
// department code in a spreadsheet does not need a separate admin step.
export const ensureDepartment = async (client, code, name) => {
  const normalised = normaliseCode(code);

  const existing = await client.department.findUnique({ where: { code: normalised } });
  if (existing) return existing;

  return client.department.create({
    data: { code: normalised, name: name?.trim() || normalised },
  });
};

// The batch a student belongs to, created on demand. One per department and
// admission year.
export const ensureBatch = async (client, { departmentId, admissionYear, currentSemester }) => {
  const existing = await client.batch.findUnique({
    where: { departmentId_admissionYear: { departmentId, admissionYear } },
  });

  if (existing) return existing;

  return client.batch.create({
    data: {
      departmentId,
      admissionYear,
      currentSemester: currentSemester && currentSemester > 0 ? currentSemester : 1,
    },
  });
};
