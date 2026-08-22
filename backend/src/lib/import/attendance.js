import { ForbiddenError } from '../access.js';
import { validateAttendance, saveAttendance, attendancePercent } from '../scoring.js';

export const columns = [
  { key: 'rollNumber', header: 'Roll Number', required: true, example: '1AB22CS001' },
  { key: 'subjectCode', header: 'Subject Code', required: true, example: 'CS301' },
  { key: 'semester', header: 'Semester', required: true, example: 3 },
  { key: 'academicYear', header: 'Academic Year', required: true, example: 2026 },
  { key: 'classesHeld', header: 'Classes Held', required: true, example: 48 },
  { key: 'classesAttended', header: 'Classes Attended', required: true, example: 41 },
  { key: 'asOfDate', header: 'As Of Date', required: false, example: '2026-03-31' },
];

export const previewExtras = [
  { key: 'studentName', header: 'Student' },
  { key: 'percent', header: 'Attendance %' },
];

export const instructions = [
  'One row per student per subject.',
  'Roll Number and Subject Code must already exist in AMIS.',
  'Classes Attended cannot be greater than Classes Held.',
  'As Of Date is the cut-off the figures were taken on; it defaults to today.',
  'Attendance below 75% raises a HIGH alert, 75-85% raises a MEDIUM one.',
  'Existing attendance for the same student, subject and semester is overwritten.',
];

const asInt = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
};

export const validate = async ({ rows, user, prisma }) => {
  const rollNumbers = [...new Set(rows.map(r => String(r.values.rollNumber ?? '').trim()).filter(Boolean))];
  const subjectCodes = [...new Set(rows.map(r => String(r.values.subjectCode ?? '').trim()).filter(Boolean))];

  const [students, subjects] = await Promise.all([
    prisma.student.findMany({
      where: { rollNumber: { in: rollNumbers } },
      select: { id: true, rollNumber: true, name: true, mentorId: true, status: true },
    }),
    prisma.subject.findMany({
      where: { code: { in: subjectCodes } },
      select: { id: true, code: true },
    }),
  ]);

  const studentByRoll = new Map(students.map(s => [s.rollNumber, s]));
  const subjectByCode = new Map(subjects.map(s => [s.code, s]));

  const seen = new Map();
  const errors = [];
  const prepared = [];

  for (const { rowNumber, values } of rows) {
    const rowErrors = [];
    const add = (column, message) => rowErrors.push({ rowNumber, column, message });

    const rollNumber = String(values.rollNumber ?? '').trim();
    const subjectCode = String(values.subjectCode ?? '').trim();
    const semester = asInt(values.semester);
    const academicYear = asInt(values.academicYear);
    const classesHeld = asInt(values.classesHeld);
    const classesAttended = asInt(values.classesAttended);

    const student = studentByRoll.get(rollNumber);
    const subject = subjectByCode.get(subjectCode);

    if (!rollNumber) {
      add('Roll Number', 'Roll Number is required.');
    } else if (!student) {
      add('Roll Number', 'No student with that Roll Number.');
    } else if (student.status !== 'ACTIVE') {
      add('Roll Number', `${rollNumber} is marked ${student.status.toLowerCase()}.`);
    } else if (user.role !== 'ADMIN' && student.mentorId !== user.id) {
      add('Roll Number', 'That student is not one of your mentees.');
    }

    if (!subjectCode) {
      add('Subject Code', 'Subject Code is required.');
    } else if (!subject) {
      add('Subject Code', 'No subject with that code.');
    }

    if (semester === null || semester < 1 || semester > 12) {
      add('Semester', 'Semester must be a whole number between 1 and 12.');
    }
    if (academicYear === null || academicYear < 1900 || academicYear > 2200) {
      add('Academic Year', 'Academic Year must be a four-digit year.');
    }

    for (const problem of validateAttendance({ classesHeld, classesAttended })) {
      add('Classes Held', problem);
    }

    let asOfDate = null;
    const rawDate = values.asOfDate;
    if (rawDate !== '' && rawDate !== null && rawDate !== undefined) {
      const parsed = rawDate instanceof Date ? rawDate : new Date(rawDate);
      if (Number.isNaN(parsed.getTime())) {
        add('As Of Date', 'As Of Date is not a valid date.');
      } else {
        asOfDate = parsed.toISOString();
      }
    }

    const key = `${rollNumber}|${subjectCode}|${semester}|${academicYear}`;
    const duplicateRow = seen.get(key);
    if (duplicateRow) {
      add('Roll Number', `Duplicate entry for this subject and semester, already on row ${duplicateRow}.`);
    } else {
      seen.set(key, rowNumber);
    }

    errors.push(...rowErrors);

    prepared.push({
      rowNumber,
      action: rowErrors.length > 0 ? 'invalid' : 'update',
      data: {
        studentId: student?.id ?? null,
        subjectId: subject?.id ?? null,
        subjectCode,
        semester,
        academicYear,
        classesHeld,
        classesAttended,
        asOfDate,
      },
      display: {
        rollNumber,
        studentName: student?.name ?? '',
        subjectCode,
        semester,
        classesHeld,
        classesAttended,
        percent: rowErrors.length === 0 ? attendancePercent({ classesHeld, classesAttended }) : null,
      },
    });
  }

  return { rows: prepared, errors };
};

export const commit = async ({ rows, user, tx }) => {
  let updated = 0;

  const studentIds = [...new Set(rows.map(row => row.data.studentId))];
  const students = await tx.student.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, mentorId: true },
  });

  if (user.role !== 'ADMIN') {
    for (const student of students) {
      if (student.mentorId !== user.id) {
        throw new ForbiddenError('That student is not one of your mentees.');
      }
    }
  }

  const recordCache = new Map();

  for (const row of rows) {
    const { studentId, subjectId, subjectCode, semester, academicYear, classesHeld, classesAttended, asOfDate } = row.data;

    const cacheKey = `${studentId}|${semester}|${academicYear}`;
    let semesterRecord = recordCache.get(cacheKey);

    if (!semesterRecord) {
      semesterRecord = await tx.semesterRecord.findUnique({
        where: { studentId_semester_academicYear: { studentId, semester, academicYear } },
      });

      if (!semesterRecord) {
        semesterRecord = await tx.semesterRecord.create({
          data: { studentId, semester, academicYear },
        });
      }

      recordCache.set(cacheKey, semesterRecord);
    }

    // Same helper the attendance grid uses, so imports and hand entry raise
    // identical LOW_ATTENDANCE alerts.
    await saveAttendance(tx, {
      semesterRecordId: semesterRecord.id,
      subjectId,
      subjectCode,
      classesHeld,
      classesAttended,
      asOfDate: asOfDate ? new Date(asOfDate) : undefined,
    });

    updated++;
  }

  return { created: 0, updated };
};
