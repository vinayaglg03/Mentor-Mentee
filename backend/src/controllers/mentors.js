import prisma from '../prismaClient.js';
import { assertCanAccessStudent, assertCanAccessSemesterRecord, assertMentorHasCapacity } from '../lib/access.js';
import { attendancePercent } from '../lib/scoring.js';
import { loadScope, ForbiddenError, NotFoundError } from '../lib/access.js';

export const getMentors = async (req, res, next) => {
  try {
    const scope = await loadScope(req.user);

    const mentors = await prisma.user.findMany({
      where: {
        role: 'MENTOR',
        ...(scope.role === 'SUPER_ADMIN' || scope.departmentIds.length === 0
          ? {}
          : { departmentId: { in: scope.departmentIds } }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        _count: { select: { students: { where: { status: 'ACTIVE' } } } }
      }
    });
    res.json(mentors);
  } catch (error) {
    next(error);
  }
};

export const getAssignedStudents = async (req, res, next) => {
  try {
    const students = await prisma.student.findMany({
      where: { status: 'ACTIVE', mentorId: req.user.id },
      include: {
        semesterRecords: {
          orderBy: { semester: 'desc' },
          include: { 
            alerts: { where: { resolved: false } },
            attendance: { select: { classesHeld: true, classesAttended: true } },
            progressLogs: {
              orderBy: { date: 'desc' },
              include: { mentor: { select: { name: true } } }
            }
          }
        }
      }
    });

    res.json(students.map(withAttendancePercent));
  } catch (error) {
    next(error);
  }
};

// Students that no mentor has claimed yet. Mentors need this to claim
// mentees; the HOD version of the same list lives in controllers/hod.js.
// Unassigned students have no mentorId, so the usual scope would return
// nothing. A mentor may claim from their own department, a coordinator from
// their sections, a super admin from anywhere.
//
// A mentor with no department is not restricted: we have no department to
// restrict them to, and blocking them would stop every mentor claiming until
// somebody filled that field in.
const claimableScope = async (user) => {
  const scope = await loadScope(user);

  if (scope.role === 'SUPER_ADMIN') return {};
  if (scope.role === 'COORDINATOR' && scope.sectionIds.length > 0) {
    return { sectionId: { in: scope.sectionIds } };
  }
  return scope.departmentIds.length > 0
    ? { departmentId: { in: scope.departmentIds } }
    : {};
};

export const getUnassignedStudents = async (req, res, next) => {
  try {
    const students = await prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        mentorId: null,
        ...(await claimableScope(req.user)),
      },
      orderBy: { rollNumber: 'asc' }
    });
    res.json(students);
  } catch (error) {
    next(error);
  }
};

// Adds a semester-level attendance percentage alongside the raw rows, so the
// dashboards do not each have to work it out.
const withAttendancePercent = (student) => ({
  ...student,
  semesterRecords: student.semesterRecords.map(record => {
    const rows = record.attendance || [];
    const classesHeld = rows.reduce((sum, row) => sum + row.classesHeld, 0);
    const classesAttended = rows.reduce((sum, row) => sum + row.classesAttended, 0);

    return {
      ...record,
      attendancePercent: attendancePercent({ classesHeld, classesAttended }),
    };
  }),
});

export const addProgressLog = async (req, res, next) => {
  try {
    const { studentId, remark, semesterRecordId, type, mode, actionItems, followUpDate, correctsId } = req.body;
    
    let targetSemId = semesterRecordId;

    if (targetSemId) {
      await assertCanAccessSemesterRecord(req.user, targetSemId);
    } else {
      await assertCanAccessStudent(req.user, studentId);
    }

    if (!targetSemId) {
      // Find current active semester record
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        include: { semesterRecords: { orderBy: { semester: 'desc' }, take: 1 } }
      });
      targetSemId = student?.semesterRecords[0]?.id;
    }

    if (!targetSemId) return res.status(400).json({ error: 'No semester record found for student' });

    // A correction is a new entry pointing at the one it corrects; the
    // original is never rewritten.
    if (correctsId) {
      const original = await prisma.progressLog.findUnique({
        where: { id: correctsId },
        select: { id: true, semesterRecordId: true },
      });

      if (!original || original.semesterRecordId !== targetSemId) {
        return res.status(400).json({ error: 'The entry being corrected does not belong to this student.' });
      }
    }

    const log = await prisma.progressLog.create({
      data: {
        semesterRecordId: targetSemId,
        mentorId: req.user.id,
        remark,
        ...(type ? { type } : {}),
        ...(mode ? { mode } : {}),
        actionItems: actionItems || null,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        correctsId: correctsId || null,
      }
    });

    res.status(201).json(log);
  } catch (error) {
    next(error);
  }
};

// The window in which an author may still fix their own wording. After it,
// the record is append-only and a correction has to be a new entry - which is
// what makes the log usable as evidence.
export const EDIT_WINDOW_MINUTES = 24 * 60;

export const updateProgressLog = async (req, res, next) => {
  try {
    const { id } = req.params;

    const log = await prisma.progressLog.findUnique({
      where: { id },
      select: { id: true, mentorId: true, createdAt: true, semesterRecordId: true },
    });

    if (!log) throw new NotFoundError('Progress log not found.');

    if (log.mentorId !== req.user.id) {
      throw new ForbiddenError('Only the author can edit a mentoring log.');
    }

    const ageMinutes = (Date.now() - new Date(log.createdAt).getTime()) / 60000;
    if (ageMinutes > EDIT_WINDOW_MINUTES) {
      return res.status(409).json({
        error: 'This entry is more than 24 hours old and can no longer be edited. Add a correction instead.',
        correctsId: log.id,
      });
    }

    const { remark, type, mode, actionItems, followUpDate, studentAcknowledged } = req.body;

    const updated = await prisma.progressLog.update({
      where: { id },
      data: {
        ...(remark !== undefined ? { remark } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(mode !== undefined ? { mode } : {}),
        ...(actionItems !== undefined ? { actionItems: actionItems || null } : {}),
        ...(followUpDate !== undefined ? { followUpDate: followUpDate ? new Date(followUpDate) : null } : {}),
        ...(studentAcknowledged !== undefined ? { studentAcknowledged } : {}),
      },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

// The mentor's own follow-up list: overdue first, then the next fortnight.
export const getFollowUps = async (req, res, next) => {
  try {
    const horizon = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const logs = await prisma.progressLog.findMany({
      where: {
        mentorId: req.user.id,
        followUpDate: { not: null, lte: horizon },
        semesterRecord: { student: { status: 'ACTIVE' } },
      },
      orderBy: { followUpDate: 'asc' },
      select: {
        id: true,
        followUpDate: true,
        remark: true,
        actionItems: true,
        type: true,
        semesterRecord: {
          select: { semester: true, student: { select: { id: true, name: true, rollNumber: true } } },
        },
      },
    });

    const now = new Date();

    res.json(logs.map(log => ({
      id: log.id,
      followUpDate: log.followUpDate,
      overdue: new Date(log.followUpDate) < now,
      type: log.type,
      remark: log.remark,
      actionItems: log.actionItems,
      semester: log.semesterRecord.semester,
      student: log.semesterRecord.student,
    })));
  } catch (error) {
    next(error);
  }
};

export const getProgressLogs = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    if (studentId) {
      await assertCanAccessStudent(req.user, studentId);
    }

    const logs = await prisma.progressLog.findMany({
      where: studentId ? { semesterRecord: { studentId } } : { mentorId: req.user.id },
      include: { 
        semesterRecord: { include: { student: { select: { name: true } } } },
        mentor: { select: { name: true } } 
      },
      orderBy: { date: 'desc' }
    });
    res.json(logs);
  } catch (error) {
    next(error);
  }
};

export const addAchievement = async (req, res, next) => {
  try {
    const { studentId, semesterRecordId, title, description } = req.body;
    
    let targetSemId = semesterRecordId;

    if (targetSemId) {
      await assertCanAccessSemesterRecord(req.user, targetSemId);
    } else {
      await assertCanAccessStudent(req.user, studentId);
    }

    if (!targetSemId) {
       const student = await prisma.student.findUnique({
        where: { id: studentId },
        include: { semesterRecords: { orderBy: { semester: 'desc' }, take: 1 } }
      });
      targetSemId = student?.semesterRecords[0]?.id;
    }

    if (!targetSemId) return res.status(400).json({ error: 'No semester record found for student' });

    const achievement = await prisma.achievement.create({
      data: {
        semesterRecordId: targetSemId,
        title,
        description
      }
    });
    res.status(201).json(achievement);
  } catch (error) {
    next(error);
  }
};

export const claimStudent = async (req, res, next) => {
  try {
    const { studentId } = req.body;
    const claimable = await claimableScope(req.user);
    const student = await prisma.student.findFirst({
      where: { id: studentId, ...claimable },
    });

    if (!student) {
      // Either it does not exist or it is outside the caller's department;
      // both are a refusal rather than a hint that it exists.
      const exists = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
      if (exists) throw new ForbiddenError('That student is not in the group you look after.');
      return res.status(404).json({ error: 'Student not found' });
    }

    if (student.mentorId) return res.status(400).json({ error: 'Student is already assigned to a mentor.' });

    await assertMentorHasCapacity(req.user.id);

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: { mentorId: req.user.id }
    });

    res.json({ message: 'Successfully claimed student', student: updated });
  } catch (error) {
    next(error);
  }
};
