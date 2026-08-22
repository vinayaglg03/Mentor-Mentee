import prisma from '../prismaClient.js';
import config from '../config.js';
import { assertCan, loadScope } from '../lib/access.js';
import { assertMentorHasCapacity } from '../lib/access.js';

const SINGLETON = 'singleton';

export const getInstitution = async () =>
  prisma.institution.findUnique({ where: { id: SINGLETON } });

// Everything the wizard needs to know about where it got to. Derived from
// the data rather than from a checklist somebody could tick without doing
// the work, so leaving and coming back always shows the truth.
export const setupStatus = async (req, res, next) => {
  try {
    const [institution, departments, faculty, students, subjects, unassigned] = await Promise.all([
      getInstitution(),
      prisma.department.count(),
      prisma.user.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
      prisma.student.count({ where: { status: 'ACTIVE' } }),
      prisma.subject.count(),
      prisma.student.count({ where: { status: 'ACTIVE', mentorId: null } }),
    ]);

    const steps = [
      { key: 'institution', label: 'Name your institution', done: Boolean(institution?.name) },
      { key: 'departments', label: 'Add departments', done: departments > 0, count: departments },
      { key: 'faculty', label: 'Import faculty', done: faculty > 0, count: faculty },
      { key: 'students', label: 'Import students', done: students > 0, count: students },
      { key: 'subjects', label: 'Import subjects', done: subjects > 0, count: subjects },
      {
        key: 'mentors',
        label: 'Assign mentors',
        done: students > 0 && unassigned === 0,
        count: students - unassigned,
        remaining: unassigned,
      },
    ];

    res.json({
      institution,
      steps,
      complete: steps.every(step => step.done),
      completedAt: institution?.setupCompletedAt ?? null,
      demoDataPresent: (await prisma.student.count({ where: { isDemo: true } })) > 0,
    });
  } catch (error) {
    next(error);
  }
};

export const saveInstitution = async (req, res, next) => {
  try {
    await assertCan(req.user, 'department:manage', null, 'Only a super admin can set up the institution.');

    const { name, shortName, logoUrl, address, academicYearStart, academicYearEnd, currentAcademicYear } = req.body;

    const data = {
      name,
      shortName: shortName || null,
      logoUrl: logoUrl || null,
      address: address || null,
      academicYearStart: academicYearStart ? new Date(academicYearStart) : null,
      academicYearEnd: academicYearEnd ? new Date(academicYearEnd) : null,
      currentAcademicYear: currentAcademicYear ?? new Date().getFullYear(),
    };

    const institution = await prisma.institution.upsert({
      where: { id: SINGLETON },
      update: data,
      create: { id: SINGLETON, ...data },
    });

    res.json(institution);
  } catch (error) {
    next(error);
  }
};

// The wizard can be left at any point; this is what it stores so it knows
// where to resume.
export const saveSetupState = async (req, res, next) => {
  try {
    await assertCan(req.user, 'department:manage');

    const institution = await prisma.institution.upsert({
      where: { id: SINGLETON },
      update: { setupState: req.body.setupState ?? {} },
      create: { id: SINGLETON, name: config.college.name, setupState: req.body.setupState ?? {} },
    });

    res.json({ setupState: institution.setupState });
  } catch (error) {
    next(error);
  }
};

export const completeSetup = async (req, res, next) => {
  try {
    await assertCan(req.user, 'department:manage');

    const institution = await prisma.institution.update({
      where: { id: SINGLETON },
      data: { setupCompletedAt: new Date() },
    });

    res.json(institution);
  } catch (error) {
    next(error);
  }
};

// Auto-distribute: give every unassigned student a mentor, evenly, respecting
// each mentor's cap and keeping students with a mentor in their own
// department. Returns what it would do when `preview` is set.
export const assignMentors = async (req, res, next) => {
  try {
    await assertCan(req.user, 'student:assign');

    const { departmentId, mentorIds, preview = false } = req.body;
    const scope = await loadScope(req.user);

    const departmentFilter = departmentId
      ? { departmentId }
      : scope.role === 'SUPER_ADMIN' || scope.departmentIds.length === 0
        ? {}
        : { departmentId: { in: scope.departmentIds } };

    if (departmentId) {
      await assertCan(req.user, 'user:manage', { departmentId },
        'You can only assign mentors in your own department.');
    }

    const [students, mentors] = await Promise.all([
      prisma.student.findMany({
        where: { status: 'ACTIVE', mentorId: null, ...departmentFilter },
        orderBy: { rollNumber: 'asc' },
        select: { id: true, name: true, rollNumber: true, departmentId: true },
      }),
      prisma.user.findMany({
        where: {
          role: 'MENTOR',
          approved: true,
          ...(mentorIds?.length ? { id: { in: mentorIds } } : {}),
          ...(departmentId ? { departmentId } : {}),
        },
        select: {
          id: true, name: true, email: true, maxStudents: true, departmentId: true,
          _count: { select: { students: { where: { status: 'ACTIVE' } } } },
        },
      }),
    ]);

    if (mentors.length === 0) {
      return res.status(400).json({ error: 'There are no mentors to assign students to. Import faculty first.' });
    }

    // Fill the emptiest mentors first, so an existing uneven split evens out
    // rather than getting worse.
    const load = new Map(mentors.map(mentor => [mentor.id, mentor._count.students]));
    const plan = [];
    const unplaced = [];

    for (const student of students) {
      const candidates = mentors
        .filter(mentor => !mentor.departmentId || mentor.departmentId === student.departmentId)
        .filter(mentor => load.get(mentor.id) < mentor.maxStudents)
        .sort((a, b) => load.get(a.id) - load.get(b.id));

      const chosen = candidates[0];

      if (!chosen) {
        unplaced.push({ ...student, reason: 'Every eligible mentor is at their limit' });
        continue;
      }

      load.set(chosen.id, load.get(chosen.id) + 1);
      plan.push({ studentId: student.id, rollNumber: student.rollNumber, name: student.name, mentorId: chosen.id, mentorName: chosen.name });
    }

    const summary = {
      toAssign: plan.length,
      unplaced: unplaced.length,
      perMentor: mentors.map(mentor => ({
        id: mentor.id,
        name: mentor.name,
        before: mentor._count.students,
        after: load.get(mentor.id),
        cap: mentor.maxStudents,
      })),
    };

    if (preview) {
      return res.json({ preview: true, summary, plan, unplaced });
    }

    await prisma.$transaction(async (tx) => {
      for (const entry of plan) {
        await tx.student.update({ where: { id: entry.studentId }, data: { mentorId: entry.mentorId } });
      }
    }, { timeout: 120000, maxWait: 15000 });

    res.json({
      message: `Assigned ${plan.length} student(s) to ${new Set(plan.map(p => p.mentorId)).size} mentor(s).`,
      summary,
      unplaced,
    });
  } catch (error) {
    next(error);
  }
};

// Bulk-assign a named list to one mentor, for when auto-distribution is not
// what the department wants.
export const assignToMentor = async (req, res, next) => {
  try {
    await assertCan(req.user, 'student:assign');

    const { mentorId, studentIds } = req.body;

    const mentor = await prisma.user.findUnique({
      where: { id: mentorId },
      select: { id: true, role: true, departmentId: true, maxStudents: true },
    });

    if (!mentor || mentor.role !== 'MENTOR') {
      return res.status(400).json({ error: 'That is not a mentor account.' });
    }

    await assertMentorHasCapacity(mentorId);

    const assigned = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const studentId of studentIds) {
        const student = await tx.student.update({ where: { id: studentId }, data: { mentorId } });
        rows.push(student.id);
      }
      return rows;
    });

    res.json({ message: `Assigned ${assigned.length} student(s).`, assigned: assigned.length });
  } catch (error) {
    next(error);
  }
};
