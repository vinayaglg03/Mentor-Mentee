import prisma from '../prismaClient.js';
import { assertCanAccessStudent, assertCanAccessSemesterRecord, assertMentorHasCapacity } from '../lib/access.js';
import { attendancePercent } from '../lib/scoring.js';

export const getMentors = async (req, res, next) => {
  try {
    const mentors = await prisma.user.findMany({
      where: { role: 'MENTOR' },
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
export const getUnassignedStudents = async (req, res, next) => {
  try {
    const students = await prisma.student.findMany({
      where: { status: 'ACTIVE', mentorId: null },
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
    const { studentId, remark, semesterRecordId } = req.body;
    
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

    const log = await prisma.progressLog.create({
      data: {
        semesterRecordId: targetSemId,
        mentorId: req.user.id,
        remark
      }
    });

    res.status(201).json(log);
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
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
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
