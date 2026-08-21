import { unauditedPrisma as prisma } from '../prismaClient.js';
import { loadScope, assertCanAccessStudent } from '../lib/access.js';

const MAX_LIMIT = 200;

// A HOD may only read entries about their own department: those made by
// somebody in it, or about a student in it.
const scopeFilter = async (user) => {
  const scope = await loadScope(user);

  if (scope.role === 'SUPER_ADMIN') return {};

  if (scope.departmentIds.length === 0) {
    return { id: '__no_access__' };
  }

  const [actors, students] = await Promise.all([
    prisma.user.findMany({
      where: { departmentId: { in: scope.departmentIds } },
      select: { id: true },
    }),
    prisma.student.findMany({
      where: { departmentId: { in: scope.departmentIds } },
      select: { id: true },
    }),
  ]);

  const studentIds = students.map(student => student.id);

  return {
    OR: [
      { actorId: { in: actors.map(actor => actor.id) } },
      { entityType: 'Student', entityId: { in: studentIds } },
    ],
  };
};

// Turns Score.update / Student.update into something a mentor can read.
const ENTITY_LABELS = {
  Student: 'student record',
  Score: 'marks',
  Attendance: 'attendance',
  ProgressLog: 'mentoring log',
  Alert: 'alert',
  User: 'user account',
  Subject: 'subject',
  Department: 'department',
  Section: 'section',
  SemesterRollover: 'semester rollover',
};

const VERBS = {
  create: 'added',
  createMany: 'added',
  update: 'changed',
  updateMany: 'changed',
  upsert: 'saved',
  delete: 'removed',
  deleteMany: 'removed',
};

export const describeEntry = (entry) => {
  const [model, operation] = entry.action.split('.');
  const subject = ENTITY_LABELS[model] ?? model;
  const verb = VERBS[operation] ?? operation;

  const changes = entry.after && typeof entry.after === 'object' && !Array.isArray(entry.after)
    ? Object.entries(entry.after)
      .filter(([, value]) => value && typeof value === 'object' && 'from' in value && 'to' in value)
      .map(([field, value]) => `${field} ${format(value.from)} → ${format(value.to)}`)
    : [];

  const who = entry.actor?.name ?? 'Someone';
  const detail = changes.length > 0 ? `: ${changes.join(', ')}` : '';

  return `${who} ${verb} ${subject}${detail}`;
};

const format = (value) => {
  if (value === null || value === undefined || value === '') return 'blank';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export const listAudit = async (req, res, next) => {
  try {
    const { entityType, entityId, actorId, from, to, limit } = req.query;

    const where = {
      ...(await scopeFilter(req.user)),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actorId ? { actorId } : {}),
      ...(from || to
        ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
        : {}),
    };

    const take = Math.min(Number(limit) || 100, MAX_LIMIT);

    const entries = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: { actor: { select: { id: true, name: true, email: true, role: true } } },
    });

    res.json({
      entries: entries.map(entry => ({ ...entry, summary: describeEntry(entry) })),
      count: entries.length,
      limit: take,
    });
  } catch (error) {
    next(error);
  }
};

// The history of one student, in plain language, for the activity tab. Uses
// the ordinary student access rules rather than the audit ones, so a mentor
// can see the history of their own mentee.
export const studentActivity = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    await assertCanAccessStudent(req.user, studentId);

    const [records, logs] = await Promise.all([
      prisma.semesterRecord.findMany({ where: { studentId }, select: { id: true } }),
      prisma.progressLog.findMany({ where: { semesterRecord: { studentId } }, select: { id: true } }),
    ]);

    const recordIds = records.map(record => record.id);

    const [scores, attendance, alerts] = await Promise.all([
      prisma.score.findMany({ where: { semesterRecordId: { in: recordIds } }, select: { id: true } }),
      prisma.attendance.findMany({ where: { semesterRecordId: { in: recordIds } }, select: { id: true } }),
      prisma.alert.findMany({ where: { semesterRecordId: { in: recordIds } }, select: { id: true } }),
    ]);

    // Everything that hangs off this student, by entity type.
    const entries = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'Student', entityId: studentId },
          { entityType: 'Score', entityId: { in: scores.map(score => score.id) } },
          { entityType: 'Attendance', entityId: { in: attendance.map(row => row.id) } },
          { entityType: 'Alert', entityId: { in: alerts.map(alert => alert.id) } },
          { entityType: 'ProgressLog', entityId: { in: logs.map(log => log.id) } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_LIMIT,
      include: { actor: { select: { id: true, name: true, role: true } } },
    });

    res.json({
      entries: entries.map(entry => ({
        id: entry.id,
        action: entry.action,
        entityType: entry.entityType,
        createdAt: entry.createdAt,
        actor: entry.actor,
        summary: describeEntry(entry),
        changes: entry.after,
      })),
    });
  } catch (error) {
    next(error);
  }
};
