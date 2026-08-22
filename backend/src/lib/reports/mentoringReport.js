import prisma from '../../prismaClient.js';
import { attendancePercent } from '../scoring.js';
import { currentCgpa } from '../gpa.js';
import {
  createDocument, drawLetterhead, sectionHeading, table, labelledFields,
  lineChart, signatures, finalise, COLOURS, ensureSpace,
} from './pdf.js';

// ROUTINE_MEETING -> Routine meeting
const sentence = (value) => {
  if (!value) return '—';
  const words = String(value).toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const date = (value) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const loadMentoringReportData = async (studentId) => {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      mentor: { select: { name: true, email: true } },
      semesterRecords: {
        orderBy: [{ academicYear: 'asc' }, { semester: 'asc' }],
        include: {
          scores: { include: { subject: { select: { code: true, name: true, credits: true } } } },
          attendance: { include: { subject: { select: { code: true, name: true } } } },
          achievements: { orderBy: { date: 'desc' } },
          alerts: { orderBy: { timestamp: 'desc' } },
          progressLogs: {
            orderBy: { date: 'desc' },
            include: { mentor: { select: { name: true } } },
          },
        },
      },
    },
  });

  return student;
};

export const buildMentoringReport = (student) => {
  const doc = createDocument({
    title: `Mentoring report - ${student.name} (${student.rollNumber})`,
    subject: 'Semester mentoring record',
  });

  const records = student.semesterRecords;
  const latest = records[records.length - 1] || null;
  const cgpa = currentCgpa(records);

  drawLetterhead(doc, {
    title: 'Student Mentoring Report',
    subtitle: `${student.name} · ${student.rollNumber} · ${student.department}`,
  });

  // --- Student details ---
  labelledFields(doc, [
    { label: 'Name', value: student.name },
    { label: 'Roll number', value: student.rollNumber },
    { label: 'Department', value: student.department },
    { label: 'Mentor', value: student.mentor?.name || 'Unassigned' },
    { label: 'Current semester', value: `Semester ${student.currentSemester}, Year ${student.currentYear}` },
    { label: 'Enrolled', value: student.enrollmentYear },
    { label: 'Current CGPA', value: cgpa ?? 'Not yet available' },
    { label: 'Status', value: student.status },
  ]);

  // --- SGPA / CGPA trend ---
  const withGpa = records.filter(record => record.sgpa !== null && record.sgpa !== undefined);
  if (withGpa.length > 0) {
    sectionHeading(doc, 'SGPA and CGPA trend');
    lineChart(doc, {
      labels: withGpa.map(record => `Sem ${record.semester}`),
      series: [
        { label: 'SGPA', colour: COLOURS.accent, values: withGpa.map(record => record.sgpa) },
        { label: 'CGPA', colour: COLOURS.ok, dashed: true, values: withGpa.map(record => record.cgpa) },
      ],
    });
  }

  // --- Marks, semester by semester ---
  sectionHeading(doc, 'Academic record');

  if (records.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLOURS.muted).text('No semester records yet.');
    doc.fillColor(COLOURS.ink).font('Helvetica');
  }

  for (const record of records) {
    ensureSpace(doc, 90);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOURS.ink)
      .text(`Semester ${record.semester} · ${record.academicYear}`);
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOURS.muted)
      .text(`SGPA ${record.sgpa ?? '—'} · CGPA ${record.cgpa ?? '—'}`);
    doc.moveDown(0.3);
    doc.fillColor(COLOURS.ink);

    table(doc, {
      columns: [
        { header: 'Code', key: 'code', width: 14, bold: true },
        { header: 'Subject', key: 'subject', width: 38 },
        { header: 'Credits', key: 'credits', width: 12, align: 'right' },
        { header: 'Internal /50', key: 'internal', width: 12, align: 'right' },
        { header: 'External /50', key: 'external', width: 12, align: 'right' },
        { header: 'Total /100', key: 'total', width: 12, align: 'right' },
      ],
      rows: record.scores.map(score => ({
        code: score.subject?.code,
        subject: score.subject?.name,
        credits: score.subject?.credits,
        internal: score.internalTotal,
        external: score.exam,
        total: score.finalScore,
        colour: score.finalScore !== null && score.finalScore < 40 ? COLOURS.danger : COLOURS.ink,
      })),
      emptyText: 'No marks recorded for this semester.',
    });

    doc.moveDown(0.4);
  }

  // --- Attendance ---
  sectionHeading(doc, 'Attendance');

  const attendanceRows = (latest?.attendance || []).map(row => ({
    code: row.subject?.code,
    subject: row.subject?.name,
    held: row.classesHeld,
    attended: row.classesAttended,
    percent: attendancePercent(row) === null ? '—' : `${attendancePercent(row)}%`,
    asOf: date(row.asOfDate),
    colour: attendancePercent(row) !== null && attendancePercent(row) < 75 ? COLOURS.danger : COLOURS.ink,
  }));

  if (latest) {
    const held = latest.attendance.reduce((sum, row) => sum + row.classesHeld, 0);
    const attended = latest.attendance.reduce((sum, row) => sum + row.classesAttended, 0);
    const overall = attendancePercent({ classesHeld: held, classesAttended: attended });

    doc.font('Helvetica').fontSize(9).fillColor(COLOURS.muted)
      .text(`Semester ${latest.semester} overall: ${overall === null ? 'not recorded' : `${overall}%`}`);
    doc.moveDown(0.3);
    doc.fillColor(COLOURS.ink);
  }

  table(doc, {
    columns: [
      { header: 'Code', key: 'code', width: 14, bold: true },
      { header: 'Subject', key: 'subject', width: 34 },
      { header: 'Held', key: 'held', width: 12, align: 'right' },
      { header: 'Attended', key: 'attended', width: 14, align: 'right' },
      { header: 'Percentage', key: 'percent', width: 13, align: 'right' },
      { header: 'As of', key: 'asOf', width: 13, align: 'right' },
    ],
    rows: attendanceRows,
    emptyText: 'No attendance recorded.',
  });

  // --- Achievements ---
  sectionHeading(doc, 'Achievements');
  table(doc, {
    columns: [
      { header: 'Date', key: 'date', width: 16 },
      { header: 'Semester', key: 'semester', width: 14 },
      { header: 'Achievement', key: 'title', width: 30, bold: true },
      { header: 'Details', key: 'description', width: 40 },
    ],
    rows: records.flatMap(record =>
      record.achievements.map(achievement => ({
        date: date(achievement.date),
        semester: `Sem ${record.semester}`,
        title: achievement.title,
        description: achievement.description || '',
      }))
    ),
    emptyText: 'No achievements recorded.',
  });

  // --- Interaction log: the part auditors ask for ---
  sectionHeading(doc, 'Record of mentoring interactions');
  table(doc, {
    columns: [
      { header: 'Date', key: 'date', width: 11 },
      { header: 'Sem', key: 'semester', width: 6 },
      { header: 'Type', key: 'type', width: 13 },
      { header: 'Mode', key: 'mode', width: 10 },
      { header: 'Mentor', key: 'mentor', width: 14 },
      { header: 'Remark and agreed actions', key: 'remark', width: 36 },
      { header: 'Follow-up', key: 'followUp', width: 10 },
    ],
    rows: records.flatMap(record =>
      record.progressLogs.map(log => ({
        sortKey: new Date(log.date).getTime(),
        date: date(log.date),
        semester: record.semester,
        type: sentence(log.type),
        mode: sentence(log.mode),
        mentor: log.mentor?.name || '—',
        remark: [
          log.remark,
          log.actionItems ? `Actions: ${log.actionItems}` : null,
          log.correctsId ? '(correction of an earlier entry)' : null,
          log.studentAcknowledged ? '(acknowledged by the student)' : null,
        ].filter(Boolean).join('\n'),
        followUp: log.followUpDate ? date(log.followUpDate) : '—',
      }))
    ).sort((a, b) => b.sortKey - a.sortKey),
    emptyText: 'No mentoring interactions recorded.',
  });

  // --- Open alerts ---
  const openAlerts = records.flatMap(record =>
    record.alerts.filter(alert => !alert.resolved).map(alert => ({
      date: date(alert.timestamp),
      semester: `Sem ${record.semester}`,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      colour: alert.severity === 'HIGH' ? COLOURS.danger : alert.severity === 'MEDIUM' ? COLOURS.warning : COLOURS.ink,
    }))
  );

  sectionHeading(doc, 'Open alerts');
  table(doc, {
    columns: [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Semester', key: 'semester', width: 12 },
      { header: 'Type', key: 'type', width: 16, bold: true },
      { header: 'Severity', key: 'severity', width: 12 },
      { header: 'Detail', key: 'message', width: 45 },
    ],
    rows: openAlerts,
    emptyText: 'No open alerts.',
  });

  signatures(doc, ['Student', 'Mentor', 'Head of Department']);
  finalise(doc, { footerNote: `${student.name} (${student.rollNumber}) · Mentoring report` });

  return doc;
};
