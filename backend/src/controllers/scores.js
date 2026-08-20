import prisma from '../prismaClient.js';
import { assertCanAccessStudent } from '../lib/access.js';

export const submitScore = async (req, res, next) => {
  try {
    const { studentId, subjectId, test1, test2, assignment, exam, academicYear, semester } = req.body;

    await assertCanAccessStudent(req.user, studentId);
    
    // 1. Find or Create SemesterRecord
    const sem = Number(semester);
    const year = Number(academicYear);

    let semesterRecord = await prisma.semesterRecord.findUnique({
      where: { 
        studentId_semester_academicYear: { studentId, semester: sem, academicYear: year } 
      }
    });

    if (!semesterRecord) {
      semesterRecord = await prisma.semesterRecord.create({
        data: { studentId, semester: sem, academicYear: year }
      });
    }

    // 2. Validation & Calculations
    const t1 = Number(test1) || 0;
    const t2 = Number(test2) || 0;
    const assign = Number(assignment) || 0;
    const examScore = exam ? Number(exam) : null;

    let internalTotal = 0;
    
    if (sem === 1 || sem === 2) {
      // SEMESTER 1-2: (CIE1(50) + CIE2(50)) / 2 = 50
      if (t1 > 50 || t2 > 50) {
        return res.status(400).json({ error: 'For Semester 1-2, CIE scores must be out of 50.' });
      }
      internalTotal = (t1 + t2) / 2;
    } else {
      // SEMESTER 3-8: ((CIE1(25) + CIE2(25)) / 2) + Assignment(25) = 50
      if (t1 > 25 || t2 > 25 || assign > 25) {
        return res.status(400).json({ error: 'For Semester 3+, CIE and Assignment must be out of 25.' });
      }
      internalTotal = ((t1 + t2) / 2) + assign;
    }

    if (examScore !== null && examScore > 50) {
      return res.status(400).json({ error: 'External exam score must be out of 50.' });
    }

    // External is entered DIRECTLY out of 50
    const externalFinal = examScore;
    
    // Final Total out of 100
    const finalScore = externalFinal !== null ? internalTotal + externalFinal : null;

    const score = await prisma.score.upsert({
      where: {
        semesterRecordId_subjectId: { 
          semesterRecordId: semesterRecord.id, 
          subjectId
        }
      },
      update: {
        test1: t1,
        test2: t2,
        assignment: assign,
        internalTotal: internalTotal,
        exam: examScore,
        finalScore,
      },
      create: {
        semesterRecordId: semesterRecord.id,
        subjectId,
        test1: t1,
        test2: t2,
        assignment: assign,
        internalTotal: internalTotal,
        exam: examScore,
        finalScore,
      }
    });

    // --- AUTO ALERTS GENERATION ---
    await generateAlerts(semesterRecord.id, score, { test1: t1, test2: t2, assignment: assign, external: externalFinal });

    res.json(score);
  } catch (error) {
    next(error);
  }
};

const generateAlerts = async (semesterRecordId, scoreResult, params) => {
  const { test1, test2, assignment, external } = params;
  const alertsToCreate = [];

  if (external !== null && external < 18) {
    alertsToCreate.push({ type: 'FAIL', severity: 'HIGH', message: `External score (${external}) in semester ${scoreResult.semester} is below 18.` });
  }
  
  if (scoreResult.finalScore !== null && scoreResult.finalScore < 40) {
    alertsToCreate.push({ type: 'AT_RISK', severity: 'HIGH', message: `Final score (${scoreResult.finalScore}) in semester ${scoreResult.semester} is below 40.` });
  }

  if (scoreResult.internalTotal !== null && scoreResult.internalTotal < 20) {
    alertsToCreate.push({ type: 'WEAK', severity: 'MEDIUM', message: `Internal total (${scoreResult.internalTotal}) in semester ${scoreResult.semester} is below 20.` });
  }

  if (Math.abs(test1 - test2) > 10) {
    alertsToCreate.push({ type: 'INCONSISTENT', severity: 'MEDIUM', message: `High variation between Test 1 (${test1}) and Test 2 (${test2}).` });
  }

  if (assignment < 10) {
    alertsToCreate.push({ type: 'LOW_ENGAGEMENT', severity: 'LOW', message: `Low assignment score (${assignment}) suggests low engagement.` });
  }

  for (const newAlert of alertsToCreate) {
    const existing = await prisma.alert.findFirst({
      where: {
        semesterRecordId,
        type: newAlert.type,
        resolved: false,
        message: newAlert.message 
      }
    });

    if (!existing) {
      await prisma.alert.create({
        data: {
          semesterRecordId,
          type: newAlert.type,
          severity: newAlert.severity,
          message: newAlert.message,
        }
      });
    }
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
