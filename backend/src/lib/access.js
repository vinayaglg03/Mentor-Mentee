import prisma from '../prismaClient.js';

export class ForbiddenError extends Error {
  constructor(message = 'You do not have access to this student record.') {
    super(message);
    this.name = 'ForbiddenError';
    this.status = 403;
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found.') {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

// An ADMIN (HOD) sees every student; a MENTOR only sees the students
// assigned to them.
const assertOwnership = (user, mentorId) => {
  if (user.role === 'ADMIN') return;
  if (mentorId !== user.id) throw new ForbiddenError();
};

// A mentor may not hold more mentees than their maxStudents cap allows.
export async function assertMentorHasCapacity(mentorId) {
  const mentor = await prisma.user.findUnique({
    where: { id: mentorId },
    select: { id: true, name: true, maxStudents: true, _count: { select: { students: { where: { status: 'ACTIVE' } } } } }
  });

  if (!mentor) throw new NotFoundError('Mentor not found.');

  if (mentor._count.students >= mentor.maxStudents) {
    const error = new Error(
      `${mentor.name} already has ${mentor._count.students} students, which is their limit of ${mentor.maxStudents}.`
    );
    error.status = 400;
    throw error;
  }

  return mentor;
}

export async function assertCanAccessStudent(user, studentId) {
  if (!studentId) throw new NotFoundError('Student not found.');

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, mentorId: true }
  });

  if (!student) throw new NotFoundError('Student not found.');
  assertOwnership(user, student.mentorId);
  return student;
}

export async function assertCanAccessSemesterRecord(user, semesterRecordId) {
  if (!semesterRecordId) throw new NotFoundError('Semester record not found.');

  const record = await prisma.semesterRecord.findUnique({
    where: { id: semesterRecordId },
    select: { id: true, semester: true, studentId: true, student: { select: { mentorId: true } } }
  });

  if (!record) throw new NotFoundError('Semester record not found.');
  assertOwnership(user, record.student.mentorId);
  return record;
}

export async function assertCanAccessAlert(user, alertId) {
  if (!alertId) throw new NotFoundError('Alert not found.');

  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    select: {
      id: true,
      semesterRecordId: true,
      semesterRecord: { select: { student: { select: { mentorId: true } } } }
    }
  });

  if (!alert) throw new NotFoundError('Alert not found.');
  assertOwnership(user, alert.semesterRecord.student.mentorId);
  return alert;
}
