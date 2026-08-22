import prisma from '../prismaClient.js';
import { assertCanAccessStudent, studentScopeWhere } from '../lib/access.js';
import { validateMarks, saveScore } from '../lib/scoring.js';
import { updateGpaForSemesterRecords } from '../lib/gpa.js';
import { requireDepartment } from '../lib/departments.js';

// Finds the semester record a set of marks belongs to, creating it on first use.
const resolveSemesterRecord = async (client, { studentId, semester, academicYear }) => {
  const existing = await client.semesterRecord.findUnique({
    where: { studentId_semester_academicYear: { studentId, semester, academicYear } },
  });

  if (existing) return existing;

  return client.semesterRecord.create({
    data: { studentId, semester, academicYear },
  });
};

export const submitScore = async (req, res, next) => {
  try {
    const { studentId, subjectId, test1, test2, assignment, exam, academicYear, semester } = req.body;

    await assertCanAccessStudent(req.user, studentId);

    const sem = Number(semester);
    const year = Number(academicYear);

    const problems = validateMarks({ semester: sem, test1, test2, assignment, exam });
    if (problems.length > 0) {
      return res.status(400).json({ error: problems[0] });
    }

    const semesterRecord = await resolveSemesterRecord(prisma, { studentId, semester: sem, academicYear: year });

    const score = await prisma.$transaction(async (tx) => {
      const saved = await saveScore(tx, {
        semesterRecordId: semesterRecord.id,
        semester: sem,
        subjectId,
        test1,
        test2,
        assignment,
        exam,
      });

      await updateGpaForSemesterRecords(tx, [semesterRecord.id]);
      return saved;
    });

    res.json(score);
  } catch (error) {
    next(error);
  }
};

// Class-wide entry: one subject, many students, applied atomically.
export const submitScoresBulk = async (req, res, next) => {
  try {
    const { subjectId, semester, academicYear, rows } = req.body;

    const sem = Number(semester);
    const year = Number(academicYear);

    const studentIds = [...new Set(rows.map(row => row.studentId))];
    for (const studentId of studentIds) {
      await assertCanAccessStudent(req.user, studentId);
    }

    const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) {
      return res.status(400).json({ error: 'Subject not found.' });
    }

    // Reject the whole batch if any row is out of range, so a save either
    // lands completely or not at all.
    const invalid = rows
      .map((row, index) => ({ index, row, problems: validateMarks({ semester: sem, ...row }) }))
      .filter(entry => entry.problems.length > 0)
      .map(entry => ({ studentId: entry.row.studentId, index: entry.index, message: entry.problems[0] }));

    if (invalid.length > 0) {
      return res.status(400).json({ error: 'Some rows are out of range.', details: invalid });
    }

    const saved = await prisma.$transaction(async (tx) => {
      const results = [];
      const touchedRecords = new Set();

      for (const row of rows) {
        const semesterRecord = await resolveSemesterRecord(tx, {
          studentId: row.studentId,
          semester: sem,
          academicYear: year,
        });

        const score = await saveScore(tx, {
          semesterRecordId: semesterRecord.id,
          semester: sem,
          subjectId,
          test1: row.test1,
          test2: row.test2,
          assignment: row.assignment,
          exam: row.exam,
        });

        results.push({ studentId: row.studentId, scoreId: score.id, finalScore: score.finalScore });
        touchedRecords.add(semesterRecord.id);
      }

      // One pass at the end rather than per row: a class of 60 shares very
      // few semester records between them, but a student never gets
      // recomputed twice in the same save.
      await updateGpaForSemesterRecords(tx, [...touchedRecords]);

      return results;
    }, { timeout: 30000, maxWait: 10000 });

    res.json({ saved: saved.length, results: saved });
  } catch (error) {
    next(error);
  }
};

export const getStudentScores = async (req, res, next) => {
  try {
    await assertCanAccessStudent(req.user, req.params.studentId);

    const scores = await prisma.score.findMany({
      where: { 
        semesterRecord: { studentId: req.params.studentId } 
      },
      include: { subject: true, semesterRecord: true }
    });
    res.json(scores);
  } catch (error) {
    next(error);
  }
};

// Every student in a department/semester with their marks for one subject,
// which is what the class-wide entry grid renders.
export const getClassScores = async (req, res, next) => {
  try {
    const { department, semester, academicYear, subjectId } = req.query;

    const sem = Number(semester);
    const year = Number(academicYear);
    const departmentRow = await requireDepartment(department);

    const students = await prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        departmentId: departmentRow.id,
        currentSemester: sem,
        ...(await studentScopeWhere(req.user)),
      },
      orderBy: { rollNumber: 'asc' },
      select: {
        id: true,
        name: true,
        rollNumber: true,
        semesterRecords: {
          where: { semester: sem, academicYear: year },
          select: {
            id: true,
            scores: {
              where: { subjectId },
              select: { test1: true, test2: true, assignment: true, exam: true, internalTotal: true, finalScore: true },
            },
          },
        },
      },
    });

    const rows = students.map(student => {
      const score = student.semesterRecords[0]?.scores[0] || null;
      return {
        studentId: student.id,
        name: student.name,
        rollNumber: student.rollNumber,
        test1: score?.test1 ?? '',
        test2: score?.test2 ?? '',
        assignment: score?.assignment ?? '',
        exam: score?.exam ?? '',
        internalTotal: score?.internalTotal ?? null,
        finalScore: score?.finalScore ?? null,
      };
    });

    res.json({ rows });
  } catch (error) {
    next(error);
  }
};
