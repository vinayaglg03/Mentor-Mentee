import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../src/prismaClient.js';

export { prisma };

export const resetDatabase = async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "ProgressLog", "Achievement", "Alert", "Attendance", "Score", "SemesterRecord", "Student", "Subject", "User", "PendingImport", "GradeBand" RESTART IDENTITY CASCADE'
  );
};

export const tokenFor = (user) =>
  jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

export const authHeader = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });

let counter = 0;
const unique = () => `${Date.now()}-${counter++}`;

export const createUser = async ({ role = 'MENTOR', approved = true, maxStudents = 30, password = 'Password123' } = {}) => {
  const id = unique();
  return prisma.user.create({
    data: {
      name: `User ${id}`,
      email: `user-${id}@example.edu`,
      password: await bcrypt.hash(password, 10),
      role,
      approved,
      maxStudents,
    },
  });
};

export const createStudent = async ({ mentorId = null, semester = 3, status = 'ACTIVE' } = {}) => {
  const id = unique();
  const student = await prisma.student.create({
    data: {
      name: `Student ${id}`,
      rollNumber: `USN-${id}`,
      department: 'CSE',
      currentYear: 2,
      currentSemester: semester,
      currentAcademicYear: 2026,
      enrollmentYear: 2024,
      mentorId,
      status,
    },
  });

  const semesterRecord = await prisma.semesterRecord.create({
    data: { studentId: student.id, semester, academicYear: 2026 },
  });

  return { student, semesterRecord };
};

export const createSubject = async ({ semester = 3 } = {}) => {
  const id = unique();
  return prisma.subject.create({
    data: { name: `Subject ${id}`, code: `SUB-${id}`, department: 'CSE', academicYear: 2026, semester },
  });
};

export const createAlert = async (semesterRecordId) =>
  prisma.alert.create({
    data: { semesterRecordId, type: 'AT_RISK', severity: 'HIGH', message: 'test alert' },
  });
