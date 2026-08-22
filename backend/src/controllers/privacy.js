import prisma from '../prismaClient.js';
import { unauditedPrisma } from '../prismaClient.js';
import config from '../config.js';
import { assertCan, assertCanAccessStudent, NotFoundError } from '../lib/access.js';
import { currentActor } from '../lib/audit.js';

// Everything AMIS holds about one student, in one file. This is what a
// student (or a parent, or a regulator) is entitled to ask for, and what the
// privacy policy promises.
export const exportStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    await assertCanAccessStudent(req.user, studentId);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        departmentRef: { select: { code: true, name: true } },
        batch: { select: { admissionYear: true, currentSemester: true } },
        section: { select: { name: true } },
        mentor: { select: { name: true, email: true } },
        semesterRecords: {
          orderBy: [{ academicYear: 'asc' }, { semester: 'asc' }],
          include: {
            scores: { include: { subject: { select: { code: true, name: true, credits: true } } } },
            attendance: { include: { subject: { select: { code: true, name: true } } } },
            alerts: { orderBy: { timestamp: 'asc' } },
            achievements: { orderBy: { date: 'asc' } },
            progressLogs: {
              orderBy: { date: 'asc' },
              include: { mentor: { select: { name: true, email: true } } },
            },
          },
        },
      },
    });

    if (!student) throw new NotFoundError('Student not found.');

    // The change history for this student, which is part of what is held.
    const recordIds = student.semesterRecords.map(record => record.id);
    const relatedIds = [
      studentId,
      ...student.semesterRecords.flatMap(record => [
        ...record.scores.map(score => score.id),
        ...record.attendance.map(row => row.id),
        ...record.alerts.map(alert => alert.id),
        ...record.progressLogs.map(log => log.id),
      ]),
    ];

    const auditEntries = await unauditedPrisma.auditLog.findMany({
      where: { entityId: { in: relatedIds } },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true, action: true, entityType: true,
        actor: { select: { name: true, email: true } },
      },
    });

    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: { id: req.user.id, role: req.user.role },
      note: 'Everything AMIS holds about this student. See docs/PRIVACY.md for what each part is for and how long it is kept.',
      student: {
        id: student.id,
        name: student.name,
        rollNumber: student.rollNumber,
        email: student.email,
        status: student.status,
        department: student.departmentRef,
        batch: student.batch,
        section: student.section?.name ?? null,
        mentor: student.mentor,
        currentSemester: student.currentSemester,
        currentYear: student.currentYear,
        enrollmentYear: student.enrollmentYear,
        createdAt: student.createdAt,
      },
      semesters: student.semesterRecords.map(record => ({
        semester: record.semester,
        academicYear: record.academicYear,
        sgpa: record.sgpa,
        cgpa: record.cgpa,
        marks: record.scores.map(score => ({
          subject: score.subject,
          test1: score.test1,
          test2: score.test2,
          assignment: score.assignment,
          internalTotal: score.internalTotal,
          exam: score.exam,
          finalScore: score.finalScore,
          recordedAt: score.createdAt,
          updatedAt: score.updatedAt,
        })),
        attendance: record.attendance.map(row => ({
          subject: row.subject,
          classesHeld: row.classesHeld,
          classesAttended: row.classesAttended,
          asOfDate: row.asOfDate,
        })),
        alerts: record.alerts,
        achievements: record.achievements,
        mentoringLogs: record.progressLogs.map(log => ({
          date: log.date,
          type: log.type,
          mode: log.mode,
          remark: log.remark,
          actionItems: log.actionItems,
          followUpDate: log.followUpDate,
          studentAcknowledged: log.studentAcknowledged,
          mentor: log.mentor,
          correctsEarlierEntry: Boolean(log.correctsId),
        })),
      })),
      changeHistory: auditEntries.map(entry => ({
        at: entry.createdAt,
        action: entry.action,
        entity: entry.entityType,
        by: entry.actor?.name ?? 'System',
      })),
      counts: {
        semesters: student.semesterRecords.length,
        semesterRecordIds: recordIds.length,
        changeHistoryEntries: auditEntries.length,
      },
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="amis-export-${student.rollNumber.replace(/[^a-z0-9]/gi, '-')}.json"`
    );
    res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    next(error);
  }
};

// Permanent deletion, which is a different thing from the soft delete that
// marks somebody DROPPED and keeps their record. This is for a deletion
// request: everything goes, and what remains is a tombstone recording that a
// deletion happened, by whom, and when - with no personal data in it.
export const eraseStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { confirmRollNumber } = req.body;

    await assertCan(req.user, 'student:delete', null, 'Only a HOD or above can erase a student record.');

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, rollNumber: true, name: true, departmentId: true, sectionId: true, mentorId: true },
    });

    if (!student) throw new NotFoundError('Student not found.');

    await assertCan(req.user, 'student:delete', student, 'You can only erase a student in your own department.');

    // Typing the roll number is the confirmation: this cannot be undone, and
    // a misclick should not be able to do it.
    if (confirmRollNumber !== student.rollNumber) {
      return res.status(400).json({
        error: `To erase this record permanently, confirm the roll number ${student.rollNumber}.`,
      });
    }

    const actor = currentActor();

    const removed = await prisma.$transaction(async (tx) => {
      const records = await tx.semesterRecord.findMany({
        where: { studentId },
        select: { id: true },
      });
      const recordIds = records.map(record => record.id);

      const counts = {
        scores: await tx.score.count({ where: { semesterRecordId: { in: recordIds } } }),
        attendance: await tx.attendance.count({ where: { semesterRecordId: { in: recordIds } } }),
        alerts: await tx.alert.count({ where: { semesterRecordId: { in: recordIds } } }),
        achievements: await tx.achievement.count({ where: { semesterRecordId: { in: recordIds } } }),
        logs: await tx.progressLog.count({ where: { semesterRecordId: { in: recordIds } } }),
        semesters: recordIds.length,
      };

      // Cascades from SemesterRecord take the marks, attendance, alerts,
      // achievements and logs with it.
      await tx.student.delete({ where: { id: studentId } });

      return counts;
    }, { timeout: 60000 });

    // The audit entries that named this student are redacted rather than
    // deleted: the fact that a change happened stays, the person does not.
    const relatedAudit = await unauditedPrisma.auditLog.updateMany({
      where: { entityType: 'Student', entityId: studentId },
      data: { before: undefined, after: { erased: true } },
    });

    await unauditedPrisma.auditLog.create({
      data: {
        actorId: actor?.id ?? req.user.id,
        actorRole: actor?.role ?? req.user.role,
        action: 'Student.erase',
        entityType: 'Student',
        entityId: studentId,
        // Deliberately no name, roll number or email: a tombstone, not a copy.
        after: { erased: true, removed, redactedAuditEntries: relatedAudit.count },
        ip: actor?.ip ?? null,
        userAgent: actor?.userAgent ?? null,
      },
    });

    res.json({
      message: 'That student record has been permanently erased.',
      removed,
      retained: 'An audit entry recording that a deletion happened, with no personal data in it.',
    });
  } catch (error) {
    next(error);
  }
};

// What the privacy page shows: the actual configured numbers, not a
// hardcoded promise that drifts from the deployment.
export const retentionPolicy = async (req, res, next) => {
  try {
    res.json({
      auditYears: config.retention.auditYears,
      graduatedStudentYears: config.retention.graduatedStudentYears,
      pendingImportMinutes: 30,
      refreshTokenDays: config.auth.refreshTokenDays,
      inactivityDays: config.notifications.inactivityDays,
      contact: config.privacy.contactEmail,
      dataController: config.college.name,
    });
  } catch (error) {
    next(error);
  }
};
