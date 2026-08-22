import { Prisma } from '@prisma/client';
import prisma from '../prismaClient.js';
import { loadScope } from './access.js';

// These used to load every student, with every semester record, with every
// score, into Node and sort in JavaScript. At 3,000 students that is roughly
// 100,000 rows crossing the wire to compute ten. The work belongs in the
// database.

// The same scope rules as lib/access.js, expressed as SQL so it can be
// composed into an aggregate query.
export const scopeCondition = async (user) => {
  const scope = await loadScope(user);

  switch (scope.role) {
    case 'SUPER_ADMIN':
      return Prisma.sql`TRUE`;

    case 'HOD':
      return scope.departmentIds.length > 0
        ? Prisma.sql`s."departmentId" IN (${Prisma.join(scope.departmentIds)})`
        : Prisma.sql`FALSE`;

    case 'COORDINATOR':
      return scope.sectionIds.length > 0
        ? Prisma.sql`s."sectionId" IN (${Prisma.join(scope.sectionIds)})`
        : Prisma.sql`FALSE`;

    default:
      return Prisma.sql`s."mentorId" = ${scope.id}`;
  }
};

// Average final score per student, computed and ordered in the database, with
// only the requested number of rows coming back.
export const topPerformers = async (user, { limit = 10 } = {}) => {
  const scope = await scopeCondition(user);

  return prisma.$queryRaw`
    SELECT
      s."id",
      s."name",
      s."rollNumber",
      s."department",
      m."name" AS "mentorName",
      ROUND(AVG(sc."finalScore")::numeric, 1)::float8 AS "averageScore",
      COUNT(sc."id")::int AS "totalSubjects"
    FROM "Student" s
    JOIN "SemesterRecord" sr ON sr."studentId" = s."id"
    JOIN "Score" sc ON sc."semesterRecordId" = sr."id" AND sc."finalScore" IS NOT NULL
    LEFT JOIN "User" m ON m."id" = s."mentorId"
    WHERE s."status" = 'ACTIVE' AND ${scope}
    GROUP BY s."id", s."name", s."rollNumber", s."department", m."name"
    ORDER BY "averageScore" DESC
    LIMIT ${limit}
  `;
};

// Pass/fail counts without pulling every score row back.
export const passFailCounts = async (user, { passMark = 40 } = {}) => {
  const scope = await scopeCondition(user);

  const [row] = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE sc."finalScore" >= ${passMark})::int AS "pass",
      COUNT(*) FILTER (WHERE sc."finalScore" < ${passMark})::int AS "fail"
    FROM "Score" sc
    JOIN "SemesterRecord" sr ON sr."id" = sc."semesterRecordId"
    JOIN "Student" s ON s."id" = sr."studentId"
    WHERE sc."finalScore" IS NOT NULL AND s."status" = 'ACTIVE' AND ${scope}
  `;

  return row ?? { pass: 0, fail: 0 };
};

export const alertCountsByType = async (user) => {
  const scope = await scopeCondition(user);

  return prisma.$queryRaw`
    SELECT a."type", COUNT(*)::int AS "count"
    FROM "Alert" a
    JOIN "SemesterRecord" sr ON sr."id" = a."semesterRecordId"
    JOIN "Student" s ON s."id" = sr."studentId"
    WHERE a."resolved" = FALSE AND s."status" = 'ACTIVE' AND ${scope}
    GROUP BY a."type"
    ORDER BY "count" DESC
  `;
};

// One row per mentor with their active mentee count, rather than a findMany
// with a _count include per mentor.
export const mentorDistribution = async (user) => {
  const scope = await loadScope(user);

  const departmentFilter = scope.role === 'SUPER_ADMIN' || scope.departmentIds.length === 0
    ? Prisma.sql`TRUE`
    : Prisma.sql`u."departmentId" IN (${Prisma.join(scope.departmentIds)})`;

  return prisma.$queryRaw`
    SELECT u."name", COUNT(s."id")::int AS "studentCount"
    FROM "User" u
    LEFT JOIN "Student" s ON s."mentorId" = u."id" AND s."status" = 'ACTIVE'
    WHERE u."role" = 'MENTOR' AND ${departmentFilter}
    GROUP BY u."id", u."name"
    ORDER BY "studentCount" DESC
  `;
};

// Students carrying an unresolved HIGH alert, with the counts the at-risk
// list needs, in one query.
export const atRiskStudents = async (user, { limit = 100 } = {}) => {
  const scope = await scopeCondition(user);

  return prisma.$queryRaw`
    SELECT
      s."id",
      s."name",
      s."rollNumber",
      s."department",
      s."currentSemester",
      m."name" AS "mentorName",
      COUNT(*) FILTER (WHERE a."severity" = 'HIGH')::int AS "highAlerts",
      COUNT(*)::int AS "openAlerts"
    FROM "Student" s
    JOIN "SemesterRecord" sr ON sr."studentId" = s."id"
    JOIN "Alert" a ON a."semesterRecordId" = sr."id" AND a."resolved" = FALSE
    LEFT JOIN "User" m ON m."id" = s."mentorId"
    WHERE s."status" = 'ACTIVE' AND ${scope}
    GROUP BY s."id", s."name", s."rollNumber", s."department", s."currentSemester", m."name"
    HAVING COUNT(*) FILTER (WHERE a."severity" = 'HIGH') > 0
    ORDER BY "highAlerts" DESC, s."rollNumber" ASC
    LIMIT ${limit}
  `;
};

// Mentees with nothing logged since `days` ago - the other half of the
// mentor's "needs attention" list.
export const quietStudents = async (user, { days = 30, limit = 100 } = {}) => {
  const scope = await scopeCondition(user);

  return prisma.$queryRaw`
    SELECT
      s."id",
      s."name",
      s."rollNumber",
      MAX(pl."date") AS "lastInteraction"
    FROM "Student" s
    LEFT JOIN "SemesterRecord" sr ON sr."studentId" = s."id"
    LEFT JOIN "ProgressLog" pl ON pl."semesterRecordId" = sr."id"
    WHERE s."status" = 'ACTIVE' AND ${scope}
    GROUP BY s."id", s."name", s."rollNumber"
    HAVING MAX(pl."date") IS NULL OR MAX(pl."date") < NOW() - (${days} || ' days')::interval
    ORDER BY MAX(pl."date") ASC NULLS FIRST
    LIMIT ${limit}
  `;
};
