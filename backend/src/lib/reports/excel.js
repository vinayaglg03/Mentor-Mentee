import ExcelJS from 'exceljs';
import config from '../../config.js';
import { attendancePercent } from '../scoring.js';
import { currentCgpa } from '../gpa.js';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
const DANGER = { argb: 'FFB91C1C' };
const WARNING = { argb: 'FFB45309' };

// Every export carries the same letterhead block: college name from config,
// what the sheet is, and when it was produced.
const addLetterhead = (sheet, { title, subtitle, columns }) => {
  const { name, department, address } = config.college;
  const span = Math.max(columns, 4);

  sheet.mergeCells(1, 1, 1, span);
  sheet.getCell(1, 1).value = name;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };

  sheet.mergeCells(2, 1, 2, span);
  sheet.getCell(2, 1).value = [department, address].filter(Boolean).join(' · ');
  sheet.getCell(2, 1).font = { size: 10, color: { argb: 'FF6B7280' } };

  sheet.mergeCells(3, 1, 3, span);
  sheet.getCell(3, 1).value = title;
  sheet.getCell(3, 1).font = { bold: true, size: 12 };

  sheet.mergeCells(4, 1, 4, span);
  sheet.getCell(4, 1).value = `${subtitle ? `${subtitle} · ` : ''}Generated ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`;
  sheet.getCell(4, 1).font = { size: 9, italic: true, color: { argb: 'FF6B7280' } };

  sheet.addRow([]);
};

const addHeaderRow = (sheet, headers) => {
  const row = sheet.addRow(headers);
  row.font = { bold: true };
  row.fill = HEADER_FILL;
  sheet.views = [{ state: 'frozen', ySplit: row.number }];
  return row;
};

const autoWidth = (sheet, widths) => {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
};

export const buildAtRiskWorkbook = ({ students, department, semester }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = config.college.name;
  const sheet = workbook.addWorksheet('At risk');

  const headers = ['Roll number', 'Name', 'Department', 'Semester', 'Mentor', 'Attendance %', 'CGPA', 'Active alerts', 'Alert details'];

  addLetterhead(sheet, {
    title: 'At-risk students',
    subtitle: [department && `Department: ${department}`, semester && `Semester: ${semester}`].filter(Boolean).join(' · ') || 'All departments and semesters',
    columns: headers.length,
  });
  addHeaderRow(sheet, headers);

  for (const student of students) {
    const record = student.semesterRecords[0];
    const alerts = record?.alerts || [];

    const held = (record?.attendance || []).reduce((sum, row) => sum + row.classesHeld, 0);
    const attended = (record?.attendance || []).reduce((sum, row) => sum + row.classesAttended, 0);
    const percent = attendancePercent({ classesHeld: held, classesAttended: attended });
    const cgpa = currentCgpa(student.semesterRecords);

    const row = sheet.addRow([
      student.rollNumber,
      student.name,
      student.department,
      record?.semester ?? student.currentSemester,
      student.mentor?.name || 'Unassigned',
      percent ?? '',
      cgpa ?? '',
      alerts.length,
      alerts.map(alert => `${alert.severity}: ${alert.message}`).join(' | '),
    ]);

    if (percent !== null && percent < 75) {
      row.getCell(6).font = { color: DANGER, bold: true };
    } else if (percent !== null && percent < 85) {
      row.getCell(6).font = { color: WARNING };
    }

    if (alerts.some(alert => alert.severity === 'HIGH')) {
      row.getCell(8).font = { color: DANGER, bold: true };
    }
  }

  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: headers.length } };
  autoWidth(sheet, [16, 24, 14, 10, 22, 14, 10, 13, 60]);

  return workbook;
};

export const buildMarksSheetWorkbook = ({ rows, subject, department, semester, academicYear }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = config.college.name;
  const sheet = workbook.addWorksheet('Marks');

  const isEarlySemester = semester === 1 || semester === 2;
  const testMax = isEarlySemester ? 50 : 25;

  const headers = [
    'Roll number',
    'Name',
    `Test 1 /${testMax}`,
    `Test 2 /${testMax}`,
    isEarlySemester ? 'Assignment (n/a)' : 'Assignment /25',
    'Internal /50',
    'External /50',
    'Total /100',
    'Result',
  ];

  addLetterhead(sheet, {
    title: `Marks sheet - ${subject.code} ${subject.name}`,
    subtitle: `${department} · Semester ${semester} · ${academicYear}`,
    columns: headers.length,
  });
  addHeaderRow(sheet, headers);

  for (const row of rows) {
    const failed = row.finalScore !== null && row.finalScore !== undefined && row.finalScore < 40;

    const added = sheet.addRow([
      row.rollNumber,
      row.name,
      row.test1 === '' ? '' : row.test1,
      row.test2 === '' ? '' : row.test2,
      isEarlySemester ? '' : (row.assignment === '' ? '' : row.assignment),
      row.internalTotal ?? '',
      row.exam === '' ? '' : row.exam,
      row.finalScore ?? '',
      row.finalScore === null || row.finalScore === undefined ? '' : failed ? 'FAIL' : 'PASS',
    ]);

    if (failed) {
      added.getCell(8).font = { color: DANGER, bold: true };
      added.getCell(9).font = { color: DANGER, bold: true };
    }
  }

  // Class statistics under the table - what gets read out in review meetings.
  const marks = rows.map(row => row.finalScore).filter(value => value !== null && value !== undefined);
  if (marks.length > 0) {
    sheet.addRow([]);
    const average = Math.round((marks.reduce((sum, value) => sum + value, 0) / marks.length) * 10) / 10;
    const passed = marks.filter(value => value >= 40).length;

    const stats = [
      ['Results recorded', marks.length],
      ['Class average', average],
      ['Highest', Math.max(...marks)],
      ['Lowest', Math.min(...marks)],
      ['Passed', passed],
      ['Failed', marks.length - passed],
    ];

    for (const [label, value] of stats) {
      const row = sheet.addRow([label, value]);
      row.getCell(1).font = { bold: true };
    }
  }

  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: headers.length } };
  autoWidth(sheet, [16, 26, 12, 12, 16, 13, 13, 12, 10]);

  return workbook;
};

export const streamWorkbook = async (workbook, res, fileName) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  const buffer = await workbook.xlsx.writeBuffer();
  res.send(Buffer.from(buffer));
};
