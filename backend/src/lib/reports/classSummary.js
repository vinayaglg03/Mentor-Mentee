import prisma from '../../prismaClient.js';
import { attendancePercent } from '../scoring.js';
import { studentScopeWhere } from '../access.js';
import {
  createDocument, drawLetterhead, sectionHeading, table, labelledFields,
  finalise, COLOURS,
} from './pdf.js';

const PASS_MARK = 40;
const round = (value) => Math.round(value * 10) / 10;

// Everything the HOD summary needs, scoped to the caller's mentees unless
// they are an ADMIN.
export const loadClassSummaryData = async ({ user, departmentId, semester, academicYear }) => {
  const students = await prisma.student.findMany({
    where: {
      status: 'ACTIVE',
      departmentId,
      currentSemester: semester,
      ...(await studentScopeWhere(user)),
    },
    orderBy: { rollNumber: 'asc' },
    include: {
      mentor: { select: { id: true, name: true } },
      semesterRecords: {
        where: { semester, academicYear },
        include: {
          scores: { include: { subject: { select: { code: true, name: true } } } },
          attendance: true,
          alerts: { where: { resolved: false } },
        },
      },
    },
  });

  return students;
};

export const summariseClass = (students) => {
  let pass = 0;
  let fail = 0;
  const bySubject = new Map();
  const byMentor = new Map();
  let atRisk = 0;
  let sgpaTotal = 0;
  let sgpaCount = 0;

  for (const student of students) {
    const record = student.semesterRecords[0];
    const mentorName = student.mentor?.name || 'Unassigned';

    if (!byMentor.has(mentorName)) {
      byMentor.set(mentorName, { mentor: mentorName, students: 0, atRisk: 0, sgpaTotal: 0, sgpaCount: 0 });
    }
    const mentorRow = byMentor.get(mentorName);
    mentorRow.students++;

    if (!record) continue;

    if (record.sgpa !== null && record.sgpa !== undefined) {
      sgpaTotal += record.sgpa;
      sgpaCount++;
      mentorRow.sgpaTotal += record.sgpa;
      mentorRow.sgpaCount++;
    }

    const highAlerts = record.alerts.filter(alert => alert.severity === 'HIGH').length;
    if (highAlerts > 0) {
      atRisk++;
      mentorRow.atRisk++;
    }

    for (const score of record.scores) {
      if (score.finalScore === null || score.finalScore === undefined) continue;

      if (score.finalScore >= PASS_MARK) pass++;
      else fail++;

      const code = score.subject?.code || '—';
      if (!bySubject.has(code)) {
        bySubject.set(code, { code, name: score.subject?.name || '', total: 0, count: 0, pass: 0, fail: 0 });
      }
      const subjectRow = bySubject.get(code);
      subjectRow.total += score.finalScore;
      subjectRow.count++;
      if (score.finalScore >= PASS_MARK) subjectRow.pass++;
      else subjectRow.fail++;
    }
  }

  return {
    students: students.length,
    pass,
    fail,
    passRate: pass + fail > 0 ? round((pass / (pass + fail)) * 100) : null,
    averageSgpa: sgpaCount > 0 ? round(sgpaTotal / sgpaCount) : null,
    atRisk,
    subjects: [...bySubject.values()].map(row => ({
      ...row,
      average: round(row.total / row.count),
      passRate: round((row.pass / row.count) * 100),
    })).sort((a, b) => a.average - b.average),
    mentors: [...byMentor.values()].map(row => ({
      ...row,
      averageSgpa: row.sgpaCount > 0 ? round(row.sgpaTotal / row.sgpaCount) : null,
    })).sort((a, b) => b.atRisk - a.atRisk),
  };
};

export const buildClassSummary = ({ students, department, semester, academicYear, scopedTo }) => {
  const summary = summariseClass(students);

  const doc = createDocument({
    title: `Class summary - ${department} semester ${semester} (${academicYear})`,
    subject: 'Class performance summary',
  });

  drawLetterhead(doc, {
    title: 'Class Performance Summary',
    subtitle: `${department} · Semester ${semester} · ${academicYear}${scopedTo ? ` · ${scopedTo}` : ''}`,
  });

  labelledFields(doc, [
    { label: 'Students', value: summary.students },
    { label: 'Subject results recorded', value: summary.pass + summary.fail },
    { label: 'Pass rate', value: summary.passRate === null ? 'No results yet' : `${summary.passRate}%` },
    { label: 'Average SGPA', value: summary.averageSgpa ?? 'Not yet available' },
    { label: 'Passed / failed', value: `${summary.pass} / ${summary.fail}` },
    { label: 'At-risk students', value: summary.atRisk },
  ], 3);

  sectionHeading(doc, 'Subject-wise performance');
  table(doc, {
    columns: [
      { header: 'Code', key: 'code', width: 14, bold: true },
      { header: 'Subject', key: 'name', width: 36 },
      { header: 'Results', key: 'count', width: 12, align: 'right' },
      { header: 'Average', key: 'average', width: 12, align: 'right' },
      { header: 'Failed', key: 'fail', width: 12, align: 'right' },
      { header: 'Pass rate', key: 'passRateLabel', width: 14, align: 'right' },
    ],
    rows: summary.subjects.map(row => ({
      ...row,
      passRateLabel: `${row.passRate}%`,
      colour: row.passRate < 60 ? COLOURS.danger : COLOURS.ink,
    })),
    emptyText: 'No marks recorded for this class yet.',
  });

  sectionHeading(doc, 'Mentor-wise breakdown');
  table(doc, {
    columns: [
      { header: 'Mentor', key: 'mentor', width: 42, bold: true },
      { header: 'Students', key: 'students', width: 18, align: 'right' },
      { header: 'At risk', key: 'atRisk', width: 18, align: 'right' },
      { header: 'Average SGPA', key: 'averageSgpa', width: 22, align: 'right' },
    ],
    rows: summary.mentors.map(row => ({
      ...row,
      colour: row.atRisk > 0 ? COLOURS.warning : COLOURS.ink,
    })),
    emptyText: 'No students in this class.',
  });

  sectionHeading(doc, 'At-risk students');
  table(doc, {
    columns: [
      { header: 'Roll number', key: 'rollNumber', width: 18, bold: true },
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Mentor', key: 'mentor', width: 20 },
      { header: 'Attendance', key: 'attendance', width: 14, align: 'right' },
      { header: 'SGPA', key: 'sgpa', width: 10, align: 'right' },
      { header: 'Alerts', key: 'alerts', width: 12, align: 'right' },
    ],
    rows: students
      .map(student => {
        const record = student.semesterRecords[0];
        if (!record) return null;

        const high = record.alerts.filter(alert => alert.severity === 'HIGH').length;
        if (high === 0) return null;

        const held = record.attendance.reduce((sum, row) => sum + row.classesHeld, 0);
        const attended = record.attendance.reduce((sum, row) => sum + row.classesAttended, 0);
        const percent = attendancePercent({ classesHeld: held, classesAttended: attended });

        return {
          rollNumber: student.rollNumber,
          name: student.name,
          mentor: student.mentor?.name || 'Unassigned',
          attendance: percent === null ? '—' : `${percent}%`,
          sgpa: record.sgpa,
          alerts: record.alerts.length,
          colour: COLOURS.danger,
        };
      })
      .filter(Boolean),
    emptyText: 'No students are currently flagged high risk.',
  });

  finalise(doc, { footerNote: `${department} · Semester ${semester} · ${academicYear}` });

  return doc;
};
