import { ForbiddenError } from '../access.js';

export const columns = [
  { key: 'name', header: 'Name', required: true, example: 'Asha Rao' },
  { key: 'rollNumber', header: 'Roll Number', required: true, example: '1AB22CS001' },
  { key: 'department', header: 'Department', required: true, example: 'CSE' },
  { key: 'enrollmentYear', header: 'Enrollment Year', required: true, example: 2024 },
  { key: 'currentSemester', header: 'Current Semester', required: true, example: 3 },
  { key: 'currentYear', header: 'Current Year', required: false, example: 2 },
  { key: 'currentAcademicYear', header: 'Academic Year', required: false, example: 2026 },
  { key: 'email', header: 'Email', required: false, example: 'asha.rao@college.edu' },
  { key: 'mentorEmail', header: 'Mentor Email', required: false, example: 'mentor@college.edu' },
];

export const instructions = [
  'One student per row. Roll Number must be unique across the college.',
  'Enrollment Year and Academic Year are four-digit years, e.g. 2026.',
  'Current Semester is 1-12. Current Year defaults to ceil(semester / 2) when left blank.',
  'Email is optional but must be unique when given.',
  'Mentor Email must belong to an existing mentor account. Mentors may only import students assigned to themselves.',
  'A student whose Roll Number already exists is updated, not duplicated.',
];

const asInt = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const mentorSelect = {
  id: true,
  email: true,
  role: true,
  maxStudents: true,
  _count: { select: { students: { where: { status: 'ACTIVE' } } } },
};

export const validate = async ({ rows, user, prisma }) => {
  const rollNumbers = rows.map(r => String(r.values.rollNumber ?? '').trim()).filter(Boolean);
  const emails = rows.map(r => String(r.values.email ?? '').trim().toLowerCase()).filter(Boolean);
  const mentorEmails = [...new Set(rows.map(r => String(r.values.mentorEmail ?? '').trim().toLowerCase()).filter(Boolean))];

  const [existingStudents, studentsWithEmail, mentors, self] = await Promise.all([
    prisma.student.findMany({ where: { rollNumber: { in: rollNumbers } }, select: { id: true, rollNumber: true, mentorId: true } }),
    prisma.student.findMany({ where: { email: { in: emails } }, select: { id: true, email: true, rollNumber: true } }),
    prisma.user.findMany({ where: { email: { in: mentorEmails } }, select: mentorSelect }),
    prisma.user.findUnique({ where: { id: user.id }, select: mentorSelect }),
  ]);

  const byRoll = new Map(existingStudents.map(s => [s.rollNumber, s]));
  const byEmail = new Map(studentsWithEmail.filter(s => s.email).map(s => [s.email.toLowerCase(), s]));
  const mentorById = new Map(mentors.map(m => [m.id, m]));
  const mentorByEmail = new Map(mentors.map(m => [m.email.toLowerCase(), m]));
  if (self) mentorById.set(self.id, self);

  const seenRolls = new Map();
  const seenEmails = new Map();
  // New assignments made by this file also count against a mentor's cap.
  const newlyAssigned = new Map();

  const errors = [];
  const prepared = [];

  for (const { rowNumber, values } of rows) {
    const rowErrors = [];
    const add = (column, message) => rowErrors.push({ rowNumber, column, message });

    const name = String(values.name ?? '').trim();
    const rollNumber = String(values.rollNumber ?? '').trim();
    const department = String(values.department ?? '').trim();
    const email = String(values.email ?? '').trim().toLowerCase();
    const mentorEmail = String(values.mentorEmail ?? '').trim().toLowerCase();

    if (!name) add('Name', 'Name is required.');
    if (!rollNumber) add('Roll Number', 'Roll Number is required.');
    if (!department) add('Department', 'Department is required.');

    const enrollmentYear = asInt(values.enrollmentYear);
    const currentSemester = asInt(values.currentSemester);
    const currentAcademicYear = asInt(values.currentAcademicYear) ?? new Date().getFullYear();
    const currentYear = asInt(values.currentYear) ?? (currentSemester ? Math.ceil(currentSemester / 2) : null);

    if (enrollmentYear === null || enrollmentYear < 1900 || enrollmentYear > 2200) {
      add('Enrollment Year', 'Enrollment Year must be a four-digit year.');
    }
    if (currentSemester === null || currentSemester < 1 || currentSemester > 12) {
      add('Current Semester', 'Current Semester must be a whole number between 1 and 12.');
    }
    if (currentYear !== null && (currentYear < 1 || currentYear > 6)) {
      add('Current Year', 'Current Year must be between 1 and 6.');
    }

    if (rollNumber) {
      const duplicateRow = seenRolls.get(rollNumber);
      if (duplicateRow) {
        add('Roll Number', `Duplicate Roll Number, already used on row ${duplicateRow}.`);
      } else {
        seenRolls.set(rollNumber, rowNumber);
      }
    }

    if (email) {
      if (!EMAIL.test(email)) {
        add('Email', 'Email is not a valid address.');
      } else {
        const duplicateRow = seenEmails.get(email);
        if (duplicateRow) {
          add('Email', `Duplicate Email, already used on row ${duplicateRow}.`);
        } else {
          seenEmails.set(email, rowNumber);
        }

        const owner = byEmail.get(email);
        if (owner && owner.rollNumber !== rollNumber) {
          add('Email', `Email already belongs to ${owner.rollNumber}.`);
        }
      }
    }

    let mentorId = null;
    if (mentorEmail) {
      const mentor = mentorByEmail.get(mentorEmail);
      if (!mentor) {
        add('Mentor Email', 'No user with that email.');
      } else if (mentor.role !== 'MENTOR') {
        add('Mentor Email', 'That account is not a mentor.');
      } else if (user.role !== 'ADMIN' && mentor.id !== user.id) {
        add('Mentor Email', 'Mentors can only import students assigned to themselves.');
      } else {
        mentorId = mentor.id;
      }
    } else if (user.role === 'MENTOR') {
      mentorId = user.id;
    }

    const existing = rollNumber ? byRoll.get(rollNumber) : null;

    if (existing && user.role !== 'ADMIN' && existing.mentorId !== user.id) {
      add('Roll Number', 'That student is assigned to another mentor.');
    }

    if (mentorId && (!existing || existing.mentorId !== mentorId)) {
      const mentor = mentorById.get(mentorId);
      if (mentor) {
        const pending = newlyAssigned.get(mentorId) ?? 0;
        if (mentor._count.students + pending >= mentor.maxStudents) {
          add('Mentor Email', `${mentor.email} is at their limit of ${mentor.maxStudents} students.`);
        } else {
          newlyAssigned.set(mentorId, pending + 1);
        }
      }
    }

    errors.push(...rowErrors);

    prepared.push({
      rowNumber,
      action: rowErrors.length > 0 ? 'invalid' : existing ? 'update' : 'create',
      data: {
        name,
        rollNumber,
        department,
        enrollmentYear,
        currentSemester,
        currentYear,
        currentAcademicYear,
        email: email || null,
        mentorId,
      },
      display: { name, rollNumber, department, currentSemester, email, mentorEmail },
    });
  }

  return { rows: prepared, errors };
};

export const commit = async ({ rows, user, tx }) => {
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const { data } = row;
    const existing = await tx.student.findUnique({ where: { rollNumber: data.rollNumber } });

    if (existing) {
      if (user.role !== 'ADMIN' && existing.mentorId !== user.id) {
        throw new ForbiddenError('That student is assigned to another mentor.');
      }

      await tx.student.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          department: data.department,
          enrollmentYear: data.enrollmentYear,
          currentSemester: data.currentSemester,
          currentYear: data.currentYear,
          currentAcademicYear: data.currentAcademicYear,
          email: data.email,
          ...(data.mentorId ? { mentorId: data.mentorId } : {}),
        },
      });
      updated++;
    } else {
      const student = await tx.student.create({ data });

      // Marks and alerts hang off a semester record, so every student needs one.
      await tx.semesterRecord.create({
        data: {
          studentId: student.id,
          semester: data.currentSemester,
          academicYear: data.currentAcademicYear,
        },
      });
      created++;
    }
  }

  return { created, updated };
};
