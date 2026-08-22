import prisma from '../prismaClient.js';
import { assertCanAccessStudent, studentScopeWhere } from '../lib/access.js';
import { validateAttendance, saveAttendance, attendancePercent } from '../lib/scoring.js';
import { requireDepartment } from '../lib/departments.js';

const resolveSemesterRecord = async (client, { studentId, semester, academicYear }) => {
  const existing = await client.semesterRecord.findUnique({
    where: { studentId_semester_academicYear: { studentId, semester, academicYear } },
  });

  if (existing) return existing;

  return client.semesterRecord.create({ data: { studentId, semester, academicYear } });
};

// One subject, many students, applied atomically - the same shape as the
// class-wide mark entry grid.
export const submitAttendanceBulk = async (req, res, next) => {
  try {
    const { subjectId, semester, academicYear, asOfDate, rows } = req.body;

    const sem = Number(semester);
    const year = Number(academicYear);

    const studentIds = [...new Set(rows.map(row => row.studentId))];
    for (const studentId of studentIds) {
      await assertCanAccessStudent(req.user, studentId);
    }

    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, code: true },
    });
    if (!subject) {
      return res.status(400).json({ error: 'Subject not found.' });
    }

    const invalid = rows
      .map((row, index) => ({ index, row, problems: validateAttendance(row) }))
      .filter(entry => entry.problems.length > 0)
      .map(entry => ({ studentId: entry.row.studentId, index: entry.index, message: entry.problems[0] }));

    if (invalid.length > 0) {
      return res.status(400).json({ error: 'Some rows are invalid.', details: invalid });
    }

    const saved = await prisma.$transaction(async (tx) => {
      const results = [];

      for (const row of rows) {
        const semesterRecord = await resolveSemesterRecord(tx, {
          studentId: row.studentId,
          semester: sem,
          academicYear: year,
        });

        const attendance = await saveAttendance(tx, {
          semesterRecordId: semesterRecord.id,
          subjectId,
          subjectCode: subject.code,
          classesHeld: Number(row.classesHeld),
          classesAttended: Number(row.classesAttended),
          asOfDate: asOfDate ? new Date(asOfDate) : undefined,
        });

        results.push({
          studentId: row.studentId,
          attendanceId: attendance.id,
          percent: attendancePercent(attendance),
        });
      }

      return results;
    }, { timeout: 30000, maxWait: 10000 });

    res.json({ saved: saved.length, results: saved });
  } catch (error) {
    next(error);
  }
};

// The class grid for one subject.
export const getClassAttendance = async (req, res, next) => {
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
            attendance: {
              where: { subjectId },
              select: { classesHeld: true, classesAttended: true, asOfDate: true },
            },
          },
        },
      },
    });

    const rows = students.map(student => {
      const record = student.semesterRecords[0]?.attendance[0] || null;
      return {
        studentId: student.id,
        name: student.name,
        rollNumber: student.rollNumber,
        classesHeld: record?.classesHeld ?? '',
        classesAttended: record?.classesAttended ?? '',
        percent: record ? attendancePercent(record) : null,
        asOfDate: record?.asOfDate ?? null,
      };
    });

    res.json({ rows });
  } catch (error) {
    next(error);
  }
};

// Every subject's attendance for one student, per semester, with the
// semester-level aggregate used on the dashboards.
export const getStudentAttendance = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    await assertCanAccessStudent(req.user, studentId);

    const records = await prisma.semesterRecord.findMany({
      where: { studentId },
      orderBy: { semester: 'desc' },
      select: {
        id: true,
        semester: true,
        academicYear: true,
        attendance: {
          select: {
            id: true,
            classesHeld: true,
            classesAttended: true,
            asOfDate: true,
            subject: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    const semesters = records.map(record => {
      const held = record.attendance.reduce((sum, row) => sum + row.classesHeld, 0);
      const attended = record.attendance.reduce((sum, row) => sum + row.classesAttended, 0);

      return {
        semesterRecordId: record.id,
        semester: record.semester,
        academicYear: record.academicYear,
        classesHeld: held,
        classesAttended: attended,
        percent: attendancePercent({ classesHeld: held, classesAttended: attended }),
        subjects: record.attendance.map(row => ({
          subjectId: row.subject.id,
          code: row.subject.code,
          name: row.subject.name,
          classesHeld: row.classesHeld,
          classesAttended: row.classesAttended,
          percent: attendancePercent(row),
          asOfDate: row.asOfDate,
        })),
      };
    });

    res.json({ semesters });
  } catch (error) {
    next(error);
  }
};
