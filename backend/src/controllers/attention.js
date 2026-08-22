import prisma from '../prismaClient.js';
import config from '../config.js';
import { studentScopeWhere, loadScope } from '../lib/access.js';
import { atRiskStudents, quietStudents } from '../lib/analyticsQueries.js';
import { attendancePercent } from '../lib/scoring.js';

// What a mentor should be looking at when they open the app. An alphabetical
// list of everybody is not that.
export const needsAttention = async (req, res, next) => {
  try {
    const days = Number(req.query.quietDays) || config.notifications.inactivityDays;

    const [risky, quiet, followUps] = await Promise.all([
      atRiskStudents(req.user, { limit: 50 }),
      quietStudents(req.user, { days, limit: 50 }),
      prisma.progressLog.findMany({
        where: {
          mentorId: req.user.id,
          followUpDate: { not: null, lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
          semesterRecord: { student: { status: 'ACTIVE' } },
        },
        orderBy: { followUpDate: 'asc' },
        take: 50,
        select: {
          id: true,
          followUpDate: true,
          remark: true,
          actionItems: true,
          type: true,
          semesterRecord: { select: { student: { select: { id: true, name: true, rollNumber: true } } } },
        },
      }),
    ]);

    // Attendance for the flagged students only, so the panel can show why
    // somebody is on the list without a second click.
    const riskyIds = risky.map(row => row.id);
    const attendance = riskyIds.length > 0
      ? await prisma.semesterRecord.findMany({
        where: { studentId: { in: riskyIds } },
        orderBy: [{ academicYear: 'desc' }, { semester: 'desc' }],
        select: {
          studentId: true,
          attendance: { select: { classesHeld: true, classesAttended: true } },
        },
      })
      : [];

    const attendanceByStudent = new Map();
    for (const record of attendance) {
      if (attendanceByStudent.has(record.studentId)) continue;
      const held = record.attendance.reduce((sum, row) => sum + row.classesHeld, 0);
      const attended = record.attendance.reduce((sum, row) => sum + row.classesAttended, 0);
      attendanceByStudent.set(record.studentId, attendancePercent({ classesHeld: held, classesAttended: attended }));
    }

    const now = new Date();

    res.json({
      atRisk: risky.map(row => ({ ...row, attendancePercent: attendanceByStudent.get(row.id) ?? null })),
      quiet: quiet.map(row => ({
        ...row,
        daysSince: row.lastInteraction
          ? Math.floor((now - new Date(row.lastInteraction)) / (24 * 60 * 60 * 1000))
          : null,
      })),
      followUps: followUps.map(log => ({
        id: log.id,
        student: log.semesterRecord.student,
        followUpDate: log.followUpDate,
        overdue: new Date(log.followUpDate) < now,
        type: log.type,
        remark: log.remark,
        actionItems: log.actionItems,
      })),
      quietDays: days,
      total: risky.length + quiet.length + followUps.length,
    });
  } catch (error) {
    next(error);
  }
};

// Roll number, partial name, or email. Scoped like everything else, so a
// mentor searching finds only their own mentees.
export const search = async (req, res, next) => {
  try {
    const term = String(req.query.q || '').trim();

    if (term.length < 2) {
      return res.json({ students: [], term });
    }

    const scope = await studentScopeWhere(req.user);

    const students = await prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        ...scope,
        OR: [
          { rollNumber: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      },
      orderBy: { rollNumber: 'asc' },
      take: 15,
      select: {
        id: true,
        name: true,
        rollNumber: true,
        department: true,
        currentSemester: true,
        mentor: { select: { name: true } },
        semesterRecords: {
          orderBy: [{ academicYear: 'desc' }, { semester: 'desc' }],
          take: 1,
          select: { alerts: { where: { resolved: false }, select: { severity: true } } },
        },
      },
    });

    const { role } = await loadScope(req.user);

    res.json({
      term,
      scope: role,
      students: students.map(student => ({
        id: student.id,
        name: student.name,
        rollNumber: student.rollNumber,
        department: student.department,
        semester: student.currentSemester,
        mentorName: student.mentor?.name ?? null,
        openAlerts: student.semesterRecords[0]?.alerts.length ?? 0,
        highAlerts: student.semesterRecords[0]?.alerts.filter(alert => alert.severity === 'HIGH').length ?? 0,
      })),
    });
  } catch (error) {
    next(error);
  }
};
