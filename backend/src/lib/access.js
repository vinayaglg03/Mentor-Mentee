import prisma from '../prismaClient.js';

export class ForbiddenError extends Error {
  constructor(message = 'You do not have access to this student record.') {
    super(message);
    this.name = 'ForbiddenError';
    this.status = 403;
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found.') {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

export const ROLES = ['SUPER_ADMIN', 'HOD', 'COORDINATOR', 'MENTOR'];

// Higher rank means wider scope. Used for "this role or above" checks.
const RANK = { SUPER_ADMIN: 4, HOD: 3, COORDINATOR: 2, MENTOR: 1 };

export const atLeast = (user, role) => (RANK[user?.role] ?? 0) >= (RANK[role] ?? 0);

// The JWT only carries id, email and role. Department membership and the
// sections a coordinator runs are read from the database and memoised on the
// request's user object, so one request costs at most one extra query.
export const loadScope = async (user) => {
  if (!user) throw new ForbiddenError('Not signed in.');
  if (user.__scope) return user.__scope;

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      role: true,
      departmentId: true,
      headedDepartments: { select: { id: true } },
      coordinatedSections: { select: { id: true, batch: { select: { departmentId: true } } } },
    },
  });

  if (!record) throw new ForbiddenError('Your account no longer exists.');

  // A HOD may be recorded either by User.departmentId or by heading a
  // Department row; both count.
  const departmentIds = [...new Set([
    record.departmentId,
    ...record.headedDepartments.map(department => department.id),
    ...record.coordinatedSections.map(section => section.batch.departmentId),
  ].filter(Boolean))];

  const scope = {
    id: record.id,
    role: record.role,
    departmentIds,
    sectionIds: record.coordinatedSections.map(section => section.id),
  };

  user.__scope = scope;
  return scope;
};

// The set of students a user may see, as a Prisma where clause. Everything
// that lists or aggregates students composes this rather than writing its
// own role check.
export const studentScopeWhere = async (user) => {
  const scope = await loadScope(user);

  switch (scope.role) {
    case 'SUPER_ADMIN':
      return {};

    case 'HOD':
      // An unassigned HOD sees nothing rather than everything.
      return scope.departmentIds.length > 0
        ? { departmentId: { in: scope.departmentIds } }
        : { id: '__no_access__' };

    case 'COORDINATOR':
      return scope.sectionIds.length > 0
        ? { sectionId: { in: scope.sectionIds } }
        : { id: '__no_access__' };

    default:
      return { mentorId: scope.id };
  }
};

const inScope = (scope, student) => {
  switch (scope.role) {
    case 'SUPER_ADMIN':
      return true;
    case 'HOD':
      return scope.departmentIds.includes(student.departmentId);
    case 'COORDINATOR':
      return Boolean(student.sectionId) && scope.sectionIds.includes(student.sectionId);
    default:
      return student.mentorId === scope.id;
  }
};

// One place where every rule lives. `resource` is optional for actions that
// are not about a particular record.
//
//   student:read | student:write   - within the caller's scope
//   student:create                 - any signed-in staff member
//   student:delete                 - HOD or above, within scope
//   student:assign                 - HOD or above (moving a mentee)
//   subject:write                  - HOD or above, own department
//   user:manage                    - HOD or above (SUPER_ADMIN for role changes)
//   user:role                      - SUPER_ADMIN only
//   department:manage              - SUPER_ADMIN only
//   batch:promote                  - HOD or above, own department
//   analytics:read                 - COORDINATOR or above
//   audit:read                     - HOD or above
export const can = async (user, action, resource = null) => {
  const scope = await loadScope(user);

  switch (action) {
    case 'student:read':
    case 'student:write':
      return resource ? inScope(scope, resource) : true;

    case 'student:create':
      return true;

    case 'student:delete':
      return atLeast(scope, 'HOD') && (!resource || inScope(scope, resource));

    case 'student:assign':
      return atLeast(scope, 'COORDINATOR') && (!resource || inScope(scope, resource));

    case 'subject:write':
      if (!atLeast(scope, 'HOD')) return false;
      if (scope.role === 'SUPER_ADMIN' || !resource) return true;
      return scope.departmentIds.includes(resource.departmentId);

    case 'user:manage':
      if (!atLeast(scope, 'HOD')) return false;
      if (scope.role === 'SUPER_ADMIN' || !resource) return true;
      // A HOD administers accounts in their own department only.
      return !resource.departmentId || scope.departmentIds.includes(resource.departmentId);

    case 'user:role':
    case 'department:manage':
      return scope.role === 'SUPER_ADMIN';

    // The shared institution row: college name, the logo on the reports, and
    // the eligibility thresholds the alert engine applies. A head of
    // department sets those; creating and renaming departments stays with the
    // administrator.
    case 'institution:manage':
      return atLeast(scope, 'HOD');

    case 'batch:promote':
      if (!atLeast(scope, 'HOD')) return false;
      if (scope.role === 'SUPER_ADMIN' || !resource) return true;
      return scope.departmentIds.includes(resource.departmentId);

    case 'analytics:read':
      return atLeast(scope, 'COORDINATOR');

    case 'audit:read':
      return atLeast(scope, 'HOD');

    default:
      return false;
  }
};

export const assertCan = async (user, action, resource = null, message) => {
  if (!(await can(user, action, resource))) {
    throw new ForbiddenError(message || `You do not have permission to ${action.replace(':', ' ')}.`);
  }
};

// A mentor may not hold more mentees than their maxStudents cap allows.
export async function assertMentorHasCapacity(mentorId) {
  const mentor = await prisma.user.findUnique({
    where: { id: mentorId },
    select: { id: true, name: true, maxStudents: true, _count: { select: { students: { where: { status: 'ACTIVE' } } } } }
  });

  if (!mentor) throw new NotFoundError('Mentor not found.');

  if (mentor._count.students >= mentor.maxStudents) {
    const error = new Error(
      `${mentor.name} already has ${mentor._count.students} students, which is their limit of ${mentor.maxStudents}.`
    );
    error.status = 400;
    throw error;
  }

  return mentor;
}

const studentSelect = { id: true, mentorId: true, departmentId: true, sectionId: true };

export async function assertCanAccessStudent(user, studentId, action = 'student:read') {
  if (!studentId) throw new NotFoundError('Student not found.');

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: studentSelect,
  });

  if (!student) throw new NotFoundError('Student not found.');
  await assertCan(user, action, student);
  return student;
}

export async function assertCanAccessSemesterRecord(user, semesterRecordId, action = 'student:read') {
  if (!semesterRecordId) throw new NotFoundError('Semester record not found.');

  const record = await prisma.semesterRecord.findUnique({
    where: { id: semesterRecordId },
    select: { id: true, semester: true, studentId: true, student: { select: studentSelect } }
  });

  if (!record) throw new NotFoundError('Semester record not found.');
  await assertCan(user, action, record.student);
  return record;
}

export async function assertCanAccessAlert(user, alertId, action = 'student:write') {
  if (!alertId) throw new NotFoundError('Alert not found.');

  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    select: {
      id: true,
      semesterRecordId: true,
      semesterRecord: { select: { student: { select: studentSelect } } }
    }
  });

  if (!alert) throw new NotFoundError('Alert not found.');
  await assertCan(user, action, alert.semesterRecord.student);
  return alert;
}
