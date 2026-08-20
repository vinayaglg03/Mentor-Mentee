import { ForbiddenError } from '../access.js';
import { validateMarks, computeScore, saveScore } from '../scoring.js';

export const columns = [
  { key: 'rollNumber', header: 'Roll Number', required: true, example: '1AB22CS001' },
  { key: 'subjectCode', header: 'Subject Code', required: true, example: 'CS301' },
  { key: 'semester', header: 'Semester', required: true, example: 3 },
  { key: 'academicYear', header: 'Academic Year', required: true, example: 2026 },
  { key: 'test1', header: 'Test 1', required: false, example: 22 },
  { key: 'test2', header: 'Test 2', required: false, example: 20 },
  { key: 'assignment', header: 'Assignment', required: false, example: 24 },
  { key: 'exam', header: 'Exam', required: false, example: 41 },
];

// Extra read-only columns shown in the preview table.
export const previewExtras = [
  { key: 'studentName', header: 'Student' },
  { key: 'internalTotal', header: 'Internal' },
  { key: 'finalScore', header: 'Final' },
];

export const instructions = [
  'One row per student per subject.',
  'Roll Number must already exist in AMIS. Import students first if they do not.',
  'Subject Code must already exist in AMIS. Import subjects first if it does not.',
  'Semesters 1-2: Test 1 and Test 2 are out of 50 and there is no assignment.',
  'Semesters 3+: Test 1, Test 2 and Assignment are each out of 25.',
  'Exam is the external mark, always out of 50. Leave it blank if results are not out yet.',
  'Existing marks for the same student, subject and semester are overwritten.',
];

const asInt = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
};

const asMark = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
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
      select: { id: true, code: true, name: true },
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

    const marks = {
      test1: asMark(values.test1),
      test2: asMark(values.test2),
      assignment: asMark(values.assignment),
      exam: asMark(values.exam),
    };

    for (const [key, label] of [['test1', 'Test 1'], ['test2', 'Test 2'], ['assignment', 'Assignment'], ['exam', 'Exam']]) {
      if (Number.isNaN(marks[key])) add(label, `${label} must be a number.`);
    }

    if (semester !== null && rowErrors.length === 0) {
      for (const problem of validateMarks({ semester, ...marks })) {
        add('Marks', problem);
      }
    }

    // The same student/subject/semester twice in one file would silently
    // overwrite itself, so flag it rather than pick a winner.
    const key = `${rollNumber}|${subjectCode}|${semester}|${academicYear}`;
    const duplicateRow = seen.get(key);
    if (duplicateRow) {
      add('Roll Number', `Duplicate entry for this subject and semester, already on row ${duplicateRow}.`);
    } else {
      seen.set(key, rowNumber);
    }

    errors.push(...rowErrors);

    const computed = semester !== null && rowErrors.length === 0
      ? computeScore({ semester, ...marks })
      : null;

    prepared.push({
      rowNumber,
      action: rowErrors.length > 0 ? 'invalid' : 'update',
      data: {
        studentId: student?.id ?? null,
        subjectId: subject?.id ?? null,
        semester,
        academicYear,
        ...marks,
      },
      display: {
        rollNumber,
        studentName: student?.name ?? '',
        subjectCode,
        semester,
        test1: marks.test1,
        test2: marks.test2,
        assignment: marks.assignment,
        exam: marks.exam,
        internalTotal: computed?.internalTotal ?? null,
        finalScore: computed?.finalScore ?? null,
      },
    });
  }

  return { rows: prepared, errors };
};

export const commit = async ({ rows, user, tx }) => {
  let updated = 0;

  // Ownership is re-checked here because the file was validated earlier and
  // assignments could have changed in between.
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
    const { studentId, subjectId, semester, academicYear, test1, test2, assignment, exam } = row.data;

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

    // Same helper the single-entry endpoint uses, so imported marks and
    // hand-entered marks produce identical totals and alerts.
    await saveScore(tx, {
      semesterRecordId: semesterRecord.id,
      semester,
      subjectId,
      test1,
      test2,
      assignment,
      exam,
    });

    updated++;
  }

  return { created: 0, updated };
};
