import { getInstitutionSettings } from './institutionSettings.js';

// Single source of truth for how marks are validated, totalled and turned into
// alerts. The single-entry endpoint, the bulk grid and the importer all call
// these helpers - the maths must never be duplicated.

// Semesters 1-2: two CIEs out of 50, averaged.
// Semesters 3+:  two CIEs out of 25, averaged, plus an assignment out of 25.
// The external exam is always entered out of 50, so the final score is /100.
export const MAX_EXAM = 50;

export const marksLimits = (semester) =>
  semester === 1 || semester === 2
    ? { test: 50, assignment: 0, exam: MAX_EXAM }
    : { test: 25, assignment: 25, exam: MAX_EXAM };

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// Returns a list of human-readable problems; empty means the marks are usable.
export const validateMarks = ({ semester, test1, test2, assignment, exam }) => {
  const limits = marksLimits(semester);
  const errors = [];

  const t1 = toNumber(test1);
  const t2 = toNumber(test2);
  const assign = toNumber(assignment);
  const examScore = toNullableNumber(exam);

  if (t1 < 0 || t2 < 0 || assign < 0 || (examScore !== null && examScore < 0)) {
    errors.push('Marks cannot be negative.');
  }

  if (t1 > limits.test || t2 > limits.test) {
    errors.push(
      semester === 1 || semester === 2
        ? 'For Semester 1-2, CIE scores must be out of 50.'
        : 'For Semester 3+, CIE and Assignment must be out of 25.'
    );
  }

  if (assign > 0 && limits.assignment === 0) {
    errors.push('Semester 1-2 has no assignment component.');
  } else if (assign > limits.assignment) {
    errors.push('For Semester 3+, CIE and Assignment must be out of 25.');
  }

  if (examScore !== null && examScore > limits.exam) {
    errors.push('External exam score must be out of 50.');
  }

  return errors;
};

// The stored shape of a Score row, derived from raw input.
export const computeScore = ({ semester, test1, test2, assignment, exam }) => {
  const t1 = toNumber(test1);
  const t2 = toNumber(test2);
  const assign = toNumber(assignment);
  const examScore = toNullableNumber(exam);

  const internalTotal =
    semester === 1 || semester === 2
      ? (t1 + t2) / 2
      : ((t1 + t2) / 2) + assign;

  return {
    test1: t1,
    test2: t2,
    assignment: assign,
    internalTotal,
    exam: examScore,
    finalScore: examScore !== null ? internalTotal + examScore : null,
  };
};

// Alerts implied by one subject's marks. `semester` lives on SemesterRecord,
// so it has to be supplied rather than read off the Score row.
export const buildScoreAlerts = ({ semester, score }) => {
  const alerts = [];
  const external = score.exam;

  if (external !== null && external < 18) {
    alerts.push({ type: 'FAIL', severity: 'HIGH', message: `External score (${external}) in semester ${semester} is below 18.` });
  }

  if (score.finalScore !== null && score.finalScore < 40) {
    alerts.push({ type: 'AT_RISK', severity: 'HIGH', message: `Final score (${score.finalScore}) in semester ${semester} is below 40.` });
  }

  if (score.internalTotal !== null && score.internalTotal < 20) {
    alerts.push({ type: 'WEAK', severity: 'MEDIUM', message: `Internal total (${score.internalTotal}) in semester ${semester} is below 20.` });
  }

  if (Math.abs(score.test1 - score.test2) > 10) {
    alerts.push({ type: 'INCONSISTENT', severity: 'MEDIUM', message: `High variation between Test 1 (${score.test1}) and Test 2 (${score.test2}).` });
  }

  if (score.assignment < 10) {
    alerts.push({ type: 'LOW_ENGAGEMENT', severity: 'LOW', message: `Low assignment score (${score.assignment}) suggests low engagement.` });
  }

  return alerts;
};

// --- Attendance ---------------------------------------------------------
// Colleges run on eligibility thresholds: below 75% is usually a bar on
// sitting the exam, 75-85% is the warning band. Those two numbers are the
// defaults, not the rule - a college on a different regulation scheme sets
// them in Settings, and they reach the engine from the Institution row.
export const ATTENDANCE_CRITICAL = 75;
export const ATTENDANCE_WARNING = 85;

export const attendancePercent = ({ classesHeld, classesAttended }) =>
  classesHeld > 0 ? Math.round((classesAttended / classesHeld) * 1000) / 10 : null;

export const buildAttendanceAlerts = ({
  subjectCode,
  classesHeld,
  classesAttended,
  critical = ATTENDANCE_CRITICAL,
  warning = ATTENDANCE_WARNING,
}) => {
  const percent = attendancePercent({ classesHeld, classesAttended });
  if (percent === null) return [];

  const where = subjectCode ? ` in ${subjectCode}` : '';

  if (percent < critical) {
    return [{
      type: 'LOW_ATTENDANCE',
      severity: 'HIGH',
      message: `Attendance${where} is ${percent}% (below ${critical}%).`,
    }];
  }

  if (percent < warning) {
    return [{
      type: 'LOW_ATTENDANCE',
      severity: 'MEDIUM',
      message: `Attendance${where} is ${percent}% (below ${warning}%).`,
    }];
  }

  return [];
};

// Upserts one subject's attendance and raises the alerts it implies.
export const saveAttendance = async (client, { semesterRecordId, subjectId, subjectCode, classesHeld, classesAttended, asOfDate }) => {
  const data = {
    classesHeld,
    classesAttended,
    ...(asOfDate ? { asOfDate } : {}),
  };

  const attendance = await client.attendance.upsert({
    where: { semesterRecordId_subjectId: { semesterRecordId, subjectId } },
    update: data,
    create: { semesterRecordId, subjectId, ...data },
  });

  const { attendanceCritical, attendanceWarning } = await getInstitutionSettings();

  await persistAlerts(
    client,
    semesterRecordId,
    buildAttendanceAlerts({
      subjectCode,
      classesHeld,
      classesAttended,
      critical: attendanceCritical,
      warning: attendanceWarning,
    })
  );

  return attendance;
};

export const validateAttendance = ({ classesHeld, classesAttended }) => {
  const errors = [];
  const held = Number(classesHeld);
  const attended = Number(classesAttended);

  if (!Number.isInteger(held) || held < 0) {
    errors.push('Classes held must be a whole number of 0 or more.');
  }
  if (!Number.isInteger(attended) || attended < 0) {
    errors.push('Classes attended must be a whole number of 0 or more.');
  }
  if (Number.isInteger(held) && Number.isInteger(attended) && attended > held) {
    errors.push('Classes attended cannot exceed classes held.');
  }

  return errors;
};

// Writes alerts that are not already open with the same message. `client` is
// either the prisma singleton or a transaction client.
export const persistAlerts = async (client, semesterRecordId, alerts) => {
  for (const alert of alerts) {
    const existing = await client.alert.findFirst({
      where: {
        semesterRecordId,
        type: alert.type,
        resolved: false,
        message: alert.message,
      },
    });

    if (!existing) {
      await client.alert.create({
        data: {
          semesterRecordId,
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
        },
      });
    }
  }
};

// Upserts one subject's marks and raises the alerts they imply.
export const saveScore = async (client, { semesterRecordId, semester, subjectId, test1, test2, assignment, exam }) => {
  const computed = computeScore({ semester, test1, test2, assignment, exam });

  const score = await client.score.upsert({
    where: { semesterRecordId_subjectId: { semesterRecordId, subjectId } },
    update: computed,
    create: { semesterRecordId, subjectId, ...computed },
  });

  await persistAlerts(client, semesterRecordId, buildScoreAlerts({ semester, score: computed }));

  return score;
};
