import prisma from '../prismaClient.js';
import { assertCanAccessStudent, NotFoundError } from '../lib/access.js';
import { streamToResponse } from '../lib/reports/pdf.js';
import { loadMentoringReportData, buildMentoringReport } from '../lib/reports/mentoringReport.js';
import { loadClassSummaryData, buildClassSummary } from '../lib/reports/classSummary.js';
import { buildAtRiskWorkbook, buildMarksSheetWorkbook, streamWorkbook } from '../lib/reports/excel.js';
import { requireDepartment, findDepartment } from '../lib/departments.js';

const slug = (value) => String(value || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

// The document a mentor signs and files each semester.
export const mentoringReport = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    await assertCanAccessStudent(req.user, studentId);

    const student = await loadMentoringReportData(studentId);
    if (!student) throw new NotFoundError('Student not found.');

    const doc = buildMentoringReport(student);
    streamToResponse(doc, res, `mentoring-report-${slug(student.rollNumber)}.pdf`);
  } catch (error) {
    next(error);
  }
};

export const classSummary = async (req, res, next) => {
  try {
    const { department, semester, academicYear } = req.query;

    const sem = Number(semester);
    const year = Number(academicYear);
    const departmentRow = await requireDepartment(department);

    const students = await loadClassSummaryData({
      user: req.user,
      departmentId: departmentRow.id,
      semester: sem,
      academicYear: year,
    });

    const doc = buildClassSummary({
      students,
      department: departmentRow.name,
      semester: sem,
      academicYear: year,
      // A mentor only ever sees their own mentees, so say so on the page
      // rather than letting it read as a whole-class figure.
      scopedTo: req.user.role === 'ADMIN' ? null : 'Your mentees only',
    });

    streamToResponse(doc, res, `class-summary-${slug(departmentRow.code)}-sem${sem}-${year}.pdf`);
  } catch (error) {
    next(error);
  }
};

export const atRiskExport = async (req, res, next) => {
  try {
    const { department, semester } = req.query;
    const sem = semester ? Number(semester) : null;
    const departmentRow = department ? await requireDepartment(department) : null;

    const students = await prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        ...(departmentRow ? { departmentId: departmentRow.id } : {}),
        ...(sem ? { currentSemester: sem } : {}),
        ...(req.user.role === 'ADMIN' ? {} : { mentorId: req.user.id }),
        semesterRecords: { some: { alerts: { some: { resolved: false } } } },
      },
      orderBy: { rollNumber: 'asc' },
      include: {
        mentor: { select: { name: true } },
        semesterRecords: {
          orderBy: [{ academicYear: 'desc' }, { semester: 'desc' }],
          include: {
            alerts: { where: { resolved: false }, orderBy: { severity: 'asc' } },
            attendance: { select: { classesHeld: true, classesAttended: true } },
          },
        },
      },
    });

    const workbook = buildAtRiskWorkbook({ students, department: departmentRow?.name, semester: sem });
    const name = ['at-risk', departmentRow && slug(departmentRow.code), sem && `sem${sem}`].filter(Boolean).join('-');
    await streamWorkbook(workbook, res, `${name}.xlsx`);
  } catch (error) {
    next(error);
  }
};

export const marksSheetExport = async (req, res, next) => {
  try {
    const { department, semester, academicYear, subjectId } = req.query;

    const sem = Number(semester);
    const year = Number(academicYear);
    const departmentRow = await requireDepartment(department);

    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, code: true, name: true },
    });
    if (!subject) throw new NotFoundError('Subject not found.');

    const students = await prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        departmentId: departmentRow.id,
        currentSemester: sem,
        ...(req.user.role === 'ADMIN' ? {} : { mentorId: req.user.id }),
      },
      orderBy: { rollNumber: 'asc' },
      select: {
        id: true,
        name: true,
        rollNumber: true,
        semesterRecords: {
          where: { semester: sem, academicYear: year },
          select: {
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
        rollNumber: student.rollNumber,
        name: student.name,
        test1: score?.test1 ?? '',
        test2: score?.test2 ?? '',
        assignment: score?.assignment ?? '',
        exam: score?.exam ?? '',
        internalTotal: score?.internalTotal ?? null,
        finalScore: score?.finalScore ?? null,
      };
    });

    const workbook = buildMarksSheetWorkbook({ rows, subject, department: departmentRow.name, semester: sem, academicYear: year });
    await streamWorkbook(workbook, res, `marks-${slug(subject.code)}-sem${sem}-${year}.xlsx`);
  } catch (error) {
    next(error);
  }
};
