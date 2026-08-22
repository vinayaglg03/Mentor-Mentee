import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../src/prismaClient.js';

export { prisma };

export const resetDatabase = async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "ProgressLog", "Achievement", "Alert", "Attendance", "Score", "SemesterRecord", "Student", "Section", "Batch", "Subject", "Department", "User", "PendingImport", "GradeBand", "SemesterRollover", "AuditLog", "RefreshToken" RESTART IDENTITY CASCADE'
  );
};

export const tokenFor = (user) =>
  jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

export const authHeader = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });

let counter = 0;
const unique = () => `${Date.now()}-${counter++}`;

export const createUser = async ({
  role = 'MENTOR',
  approved = true,
  maxStudents = 30,
  password = 'Password123',
  departmentCode = null,
} = {}) => {
  const id = unique();
  const department = departmentCode ? await createDepartment({ code: departmentCode }) : null;

  return prisma.user.create({
    data: {
      name: `User ${id}`,
      email: `user-${id}@example.edu`,
      password: await bcrypt.hash(password, 10),
      role,
      approved,
      maxStudents,
      departmentId: department?.id ?? null,
    },
  });
};

// A HOD is only useful once they have a department to be head of.
export const createHod = async ({ departmentCode = 'CSE' } = {}) => {
  const department = await createDepartment({ code: departmentCode });
  const hod = await createUser({ role: 'HOD', departmentCode });
  await prisma.department.update({ where: { id: department.id }, data: { hodId: hod.id } });
  return hod;
};

export const createSuperAdmin = () => createUser({ role: 'SUPER_ADMIN' });

export const createCoordinator = async ({ section }) => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  await prisma.section.update({ where: { id: section.id }, data: { coordinatorId: coordinator.id } });
  return coordinator;
};

// Departments, batches and sections are created on demand so a test only
// has to care about them when it is testing them.
export const createDepartment = async ({ code = 'CSE', name } = {}) =>
  prisma.department.upsert({
    where: { code },
    update: name ? { name } : {},
    create: { code, name: name || code },
  });

export const createBatch = async ({ departmentCode = 'CSE', admissionYear = 2024, currentSemester = 3 } = {}) => {
  const department = await createDepartment({ code: departmentCode });
  return prisma.batch.upsert({
    where: { departmentId_admissionYear: { departmentId: department.id, admissionYear } },
    update: {},
    create: { departmentId: department.id, admissionYear, currentSemester },
  });
};

export const createSection = async ({ batch, name = 'A', coordinatorId = null } = {}) => {
  const target = batch || await createBatch();
  return prisma.section.create({
    data: { batchId: target.id, name, coordinatorId },
  });
};

export const createStudent = async ({
  mentorId = null,
  semester = 3,
  status = 'ACTIVE',
  departmentCode = 'CSE',
  admissionYear = 2024,
  sectionId = null,
} = {}) => {
  const id = unique();
  const department = await createDepartment({ code: departmentCode });
  const batch = await createBatch({ departmentCode, admissionYear, currentSemester: semester });

  const student = await prisma.student.create({
    data: {
      name: `Student ${id}`,
      rollNumber: `USN-${id}`,
      department: departmentCode,
      departmentId: department.id,
      batchId: batch.id,
      sectionId,
      currentYear: 2,
      currentSemester: semester,
      currentAcademicYear: 2026,
      enrollmentYear: admissionYear,
      mentorId,
      status,
    },
  });

  const semesterRecord = await prisma.semesterRecord.create({
    data: { studentId: student.id, semester, academicYear: 2026 },
  });

  return { student, semesterRecord };
};

export const createSubject = async ({ semester = 3, departmentCode = 'CSE', credits = 3 } = {}) => {
  const id = unique();
  const department = await createDepartment({ code: departmentCode });

  return prisma.subject.create({
    data: {
      name: `Subject ${id}`,
      code: `SUB-${id}`,
      department: departmentCode,
      departmentId: department.id,
      academicYear: 2026,
      semester,
      credits,
    },
  });
};

export const createAlert = async (semesterRecordId) =>
  prisma.alert.create({
    data: { semesterRecordId, type: 'AT_RISK', severity: 'HIGH', message: 'test alert' },
  });
