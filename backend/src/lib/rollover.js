import { NotFoundError } from './access.js';
import { updateGpaForStudents } from './gpa.js';

export const FINAL_SEMESTER = 8;

// The academic year rolls over when a batch moves into an odd semester:
// 3 -> 4 is the same year, 4 -> 5 is the next one.
export const nextAcademicYear = (currentAcademicYear, toSemester) =>
  toSemester % 2 === 1 ? currentAcademicYear + 1 : currentAcademicYear;

export const yearForSemester = (semester) => Math.ceil(semester / 2);

const loadBatch = async (client, batchId) => {
  const batch = await client.batch.findUnique({
    where: { id: batchId },
    include: {
      department: { select: { id: true, code: true, name: true } },
      students: {
        orderBy: { rollNumber: 'asc' },
        select: {
          id: true, name: true, rollNumber: true, status: true,
          currentSemester: true, currentYear: true, currentAcademicYear: true,
          mentorId: true, departmentId: true, sectionId: true,
        },
      },
    },
  });

  if (!batch) throw new NotFoundError('Batch not found.');
  return batch;
};

// What a promotion would do, without doing it. Every student in the batch is
// accounted for: promoted, graduated, or skipped with a reason.
export const planPromotion = async (client, batchId) => {
  const batch = await loadBatch(client, batchId);

  const fromSemester = batch.currentSemester;
  const toSemester = fromSemester + 1;

  const promote = [];
  const graduate = [];
  const skip = [];

  for (const student of batch.students) {
    if (student.status !== 'ACTIVE') {
      skip.push({ ...student, reason: `Marked ${student.status.toLowerCase()}` });
      continue;
    }

    if (student.currentSemester > fromSemester) {
      skip.push({ ...student, reason: `Already in semester ${student.currentSemester}` });
      continue;
    }

    if (student.currentSemester < fromSemester) {
      // Detained: the batch has moved on and this student has not.
      skip.push({ ...student, reason: `Detained in semester ${student.currentSemester}` });
      continue;
    }

    if (student.currentSemester >= FINAL_SEMESTER) {
      graduate.push({ ...student, reason: 'Completed the final semester' });
      continue;
    }

    promote.push({
      ...student,
      toSemester,
      toYear: yearForSemester(toSemester),
      toAcademicYear: nextAcademicYear(student.currentAcademicYear, toSemester),
    });
  }

  return {
    batch: {
      id: batch.id,
      admissionYear: batch.admissionYear,
      currentSemester: batch.currentSemester,
      department: batch.department,
    },
    fromSemester,
    toSemester,
    isFinal: fromSemester >= FINAL_SEMESTER,
    summary: {
      total: batch.students.length,
      promote: promote.length,
      graduate: graduate.length,
      skip: skip.length,
    },
    promote,
    graduate,
    skip,
  };
};

// Applies a plan inside one transaction. `expectedFromSemester` comes from the
// preview: if the batch has moved since, the run is refused rather than
// promoting twice.
export const applyPromotion = async (tx, { batchId, actorId, expectedFromSemester }) => {
  const plan = await planPromotion(tx, batchId);

  if (expectedFromSemester !== undefined && expectedFromSemester !== plan.fromSemester) {
    const error = new Error(
      `This batch is already in semester ${plan.fromSemester}; the preview was taken at semester ${expectedFromSemester}. Review it again.`
    );
    error.status = 409;
    throw error;
  }

  if (plan.promote.length === 0 && plan.graduate.length === 0) {
    const error = new Error('There is nobody in this batch left to promote.');
    error.status = 400;
    throw error;
  }

  for (const student of plan.promote) {
    await tx.student.update({
      where: { id: student.id },
      data: {
        currentSemester: student.toSemester,
        currentYear: student.toYear,
        currentAcademicYear: student.toAcademicYear,
        // The mentor assignment carries forward untouched.
      },
    });

    // Marks and attendance for the new semester hang off this record.
    await tx.semesterRecord.upsert({
      where: {
        studentId_semester_academicYear: {
          studentId: student.id,
          semester: student.toSemester,
          academicYear: student.toAcademicYear,
        },
      },
      update: {},
      create: {
        studentId: student.id,
        semester: student.toSemester,
        academicYear: student.toAcademicYear,
      },
    });
  }

  for (const student of plan.graduate) {
    await tx.student.update({
      where: { id: student.id },
      data: { status: 'GRADUATED' },
    });
  }

  // Only the batch itself advances when there was somebody to advance.
  if (plan.promote.length > 0) {
    await tx.batch.update({
      where: { id: batchId },
      data: { currentSemester: plan.toSemester },
    });
  }

  await updateGpaForStudents(tx, [...plan.promote, ...plan.graduate].map(student => student.id));

  const rollover = await tx.semesterRollover.create({
    data: {
      batchId,
      actorId: actorId ?? null,
      fromSemester: plan.fromSemester,
      toSemester: plan.toSemester,
      promoted: plan.promote.length,
      graduated: plan.graduate.length,
      skipped: plan.skip.length,
      details: {
        promoted: plan.promote.map(s => ({ id: s.id, rollNumber: s.rollNumber, toSemester: s.toSemester })),
        graduated: plan.graduate.map(s => ({ id: s.id, rollNumber: s.rollNumber })),
        skipped: plan.skip.map(s => ({ id: s.id, rollNumber: s.rollNumber, reason: s.reason })),
      },
    },
  });

  return { rollover, plan };
};
