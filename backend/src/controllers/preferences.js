import prisma from '../prismaClient.js';
import { assertCan, can, loadScope, ForbiddenError, NotFoundError } from '../lib/access.js';
import { invalidateInstitutionSettings, DEFAULTS } from '../lib/institutionSettings.js';

// Personal settings. Everything here is scoped to req.user.id and nothing
// accepts a user id from the caller - there is no route by which one person
// can read or write another person's preferences.

const DEFAULT_PREFERENCE = {
  theme: 'system',
  density: 'comfortable',
  // null means "whatever the operating system says". Only an explicit choice
  // in Settings makes it true or false.
  reduceMotion: null,
  defaultDepartmentId: null,
  defaultSemester: null,
  defaultAcademicYear: null,
  notifyDailyDigest: true,
  notifyWeeklyDigest: false,
  notifyHighSeverity: false,
};

const shape = (preference, user) => ({
  theme: preference?.theme ?? DEFAULT_PREFERENCE.theme,
  density: preference?.density ?? DEFAULT_PREFERENCE.density,
  reduceMotion: preference?.reduceMotion ?? null,
  defaultDepartmentId: preference?.defaultDepartmentId ?? null,
  defaultSemester: preference?.defaultSemester ?? null,
  defaultAcademicYear: preference?.defaultAcademicYear ?? null,
  // Before this table existed, "do I get a digest" lived on User. For anybody
  // who has not opened Settings since, that is still the honest answer.
  notifyDailyDigest: preference?.notifyDailyDigest
    ?? (user ? user.digestFrequency === 'DAILY' : DEFAULT_PREFERENCE.notifyDailyDigest),
  notifyWeeklyDigest: preference?.notifyWeeklyDigest
    ?? (user ? user.digestFrequency === 'WEEKLY' : DEFAULT_PREFERENCE.notifyWeeklyDigest),
  notifyHighSeverity: preference?.notifyHighSeverity ?? DEFAULT_PREFERENCE.notifyHighSeverity,
});

// The digest jobs read User.digestFrequency, which existed before this table.
// Rather than have two places disagree about whether somebody gets an email,
// the switches here are projected back onto it.
const digestFrequencyFor = ({ notifyDailyDigest, notifyWeeklyDigest }) => {
  if (notifyDailyDigest) return 'DAILY';
  if (notifyWeeklyDigest) return 'WEEKLY';
  return 'OFF';
};

export const getPreferences = async (req, res, next) => {
  try {
    const [preference, user] = await Promise.all([
      prisma.userPreference.findUnique({ where: { userId: req.user.id } }),
      prisma.user.findUnique({
        where: { id: req.user.id },
        select: { digestFrequency: true },
      }),
    ]);

    res.json(shape(preference, user));
  } catch (error) {
    next(error);
  }
};

export const updatePreferences = async (req, res, next) => {
  try {
    const patch = req.body;

    // A default department has to be one this person can actually see;
    // otherwise mark entry would open on a department they cannot load.
    if (patch.defaultDepartmentId) {
      const department = await prisma.department.findUnique({
        where: { id: patch.defaultDepartmentId },
        select: { id: true },
      });

      if (!department) throw new NotFoundError('That department does not exist.');

      const visible = await prisma.department.findMany({
        where: await departmentScopeWhere(req.user),
        select: { id: true },
      });

      if (!visible.some(item => item.id === patch.defaultDepartmentId)) {
        throw new ForbiddenError('You do not have access to that department.');
      }
    }

    const existing = await prisma.userPreference.findUnique({ where: { userId: req.user.id } });
    const merged = { ...shape(existing), ...patch };

    const preference = await prisma.userPreference.upsert({
      where: { userId: req.user.id },
      update: patch,
      create: { userId: req.user.id, ...patch },
    });

    if ('notifyDailyDigest' in patch || 'notifyWeeklyDigest' in patch) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { digestFrequency: digestFrequencyFor(merged) },
      });
    }

    res.json(shape(preference));
  } catch (error) {
    next(error);
  }
};

// Which departments this user may pick as their default. A super admin sees
// all of them; everybody else sees the one they belong to or head.
const departmentScopeWhere = async (user) => {
  // loadScope is the same resolution the rest of the app uses: it counts both
  // User.departmentId and any department the person heads, and it is memoised
  // per request. Re-deriving it from the token here would hand a mentor whose
  // token carries no departmentId an empty list.
  const scope = await loadScope(user);

  if (scope.role === 'SUPER_ADMIN') return {};

  return scope.departmentIds.length
    ? { id: { in: scope.departmentIds } }
    : { id: '__no_access__' };
};

export const listDepartmentOptions = async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      where: await departmentScopeWhere(req.user),
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });

    res.json(departments);
  } catch (error) {
    next(error);
  }
};

// --- Institution -------------------------------------------------------------
// One shared row. Readable by anybody signed in, because the app shows the
// college name and the thresholds it is applying; writable only by a head of
// department or above.

export const getInstitution = async (req, res, next) => {
  try {
    const institution = await prisma.institution.findUnique({ where: { id: 'singleton' } });

    res.json({
      name: institution?.name ?? null,
      shortName: institution?.shortName ?? null,
      logoUrl: institution?.logoUrl ?? null,
      currentAcademicYear: institution?.currentAcademicYear ?? null,
      attendanceCritical: institution?.attendanceCritical ?? DEFAULTS.attendanceCritical,
      attendanceWarning: institution?.attendanceWarning ?? DEFAULTS.attendanceWarning,
      markConcernPercent: institution?.markConcernPercent ?? DEFAULTS.markConcernPercent,
      setupCompletedAt: institution?.setupCompletedAt ?? null,
      canEdit: await can(req.user, 'institution:manage'),
    });
  } catch (error) {
    next(error);
  }
};

export const updateInstitution = async (req, res, next) => {
  try {
    await assertCan(req.user, 'institution:manage');

    const patch = req.body;

    if (
      patch.attendanceCritical !== undefined
      && patch.attendanceWarning !== undefined
      && patch.attendanceCritical > patch.attendanceWarning
    ) {
      return res.status(400).json({
        error: 'The critical threshold cannot be higher than the warning threshold.',
      });
    }

    const institution = await prisma.institution.upsert({
      where: { id: 'singleton' },
      update: patch,
      create: { id: 'singleton', name: patch.name || 'My institution', ...patch },
    });

    // The alert engine caches these; without this the change would not show
    // up until the cache expired or the process restarted.
    invalidateInstitutionSettings();

    res.json({
      name: institution.name,
      shortName: institution.shortName,
      logoUrl: institution.logoUrl,
      currentAcademicYear: institution.currentAcademicYear,
      attendanceCritical: institution.attendanceCritical,
      attendanceWarning: institution.attendanceWarning,
      markConcernPercent: institution.markConcernPercent,
      canEdit: true,
    });
  } catch (error) {
    next(error);
  }
};
