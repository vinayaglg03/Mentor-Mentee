import prisma from '../prismaClient.js';
import { assertMentorHasCapacity, studentScopeWhere, loadScope, assertCanAccessStudent } from '../lib/access.js';

// GET all students across all years
export const getAllStudents = async (req, res, next) => {
  try {
    const students = await prisma.student.findMany({
      where: { status: 'ACTIVE', ...(await studentScopeWhere(req.user)) },
      include: {
        mentor: { select: { id: true, name: true } },
        semesterRecords: {
          orderBy: { semester: 'desc' },
          include: {
            alerts: { where: { resolved: false } },
            progressLogs: {
              orderBy: { date: 'desc' },
              include: { mentor: { select: { name: true } } }
            }
          }
        }
      },
      orderBy: { rollNumber: 'asc' }
    });
    res.json(students);
  } catch (error) {
    next(error);
  }
};

// A mentor picking up an unassigned student is limited to their own
// department, since mentorId is null for all of them and the usual scope
// would return nothing.
const unassignedScope = async (user) => {
  const scope = await loadScope(user);

  if (scope.role === 'SUPER_ADMIN') return {};
  if (scope.role === 'COORDINATOR' && scope.sectionIds.length > 0) {
    return { sectionId: { in: scope.sectionIds } };
  }
  return scope.departmentIds.length > 0
    ? { departmentId: { in: scope.departmentIds } }
    : {};
};

// GET unassigned students
export const getUnassignedStudents = async (req, res, next) => {
  try {
    // Unassigned students are still limited to what the caller may see, so a
    // HOD cannot claim a student out of another department.
    const students = await prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        mentorId: null,
        ...(await unassignedScope(req.user)),
      },
      orderBy: { rollNumber: 'asc' }
    });
    res.json(students);
  } catch (error) {
    next(error);
  }
};

// PUT Assign student to mentor
export const assignStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { mentorId } = req.body;

    await assertCanAccessStudent(req.user, studentId, 'student:assign');

    if (mentorId) {
      const mentor = await prisma.user.findUnique({ where: { id: mentorId } });
      if (!mentor || mentor.role !== 'MENTOR') {
        return res.status(400).json({ error: 'Valid mentor ID required' });
      }

      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { mentorId: true }
      });
      // Re-saving a student against the mentor they already have must not
      // fail just because that mentor is at their cap.
      if (student?.mentorId !== mentorId) {
        await assertMentorHasCapacity(mentorId);
      }
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: { mentorId: mentorId || null }
    });

    res.json({ message: 'Assignment updated successfully', student: updated });
  } catch (error) {
    next(error);
  }
};

// GET At-Risk Students Masterlist
export const getAtRiskStudents = async (req, res, next) => {
  try {
    const atRisk = await prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        ...(await studentScopeWhere(req.user)),
        semesterRecords: {
          some: {
            alerts: {
              some: { resolved: false, severity: 'HIGH' }
            }
          }
        }
      },
      include: {
        mentor: { select: { name: true } },
        semesterRecords: {
          orderBy: { semester: 'desc' },
          take: 1,
          include: {
            alerts: { where: { resolved: false } }
          }
        }
      }
    });
    res.json(atRisk);
  } catch (error) {
    next(error);
  }
};

// GET Top Performers Insight
export const getTopPerformers = async (req, res, next) => {
  try {
    const studentsWithRecords = await prisma.student.findMany({
      where: { status: 'ACTIVE', ...(await studentScopeWhere(req.user)) },
      include: { 
        semesterRecords: {
          include: { scores: true }
        }, 
        mentor: { select: { name: true } } 
      }
    });

    const performance = studentsWithRecords.map(student => {
      const allScores = student.semesterRecords.flatMap(r => r.scores);
      const totalScore = allScores.reduce((sum, score) => sum + (score.finalScore || 0), 0);
      const avgScore = allScores.length > 0 ? totalScore / allScores.length : 0;
      return {
        id: student.id,
        name: student.name,
        rollNumber: student.rollNumber,
        department: student.department,
        mentorName: student.mentor?.name || 'Unassigned',
        averageScore: Math.round(avgScore * 10) / 10,
        totalSubjects: allScores.length
      };
    });

    const top10 = performance.sort((a, b) => b.averageScore - a.averageScore).slice(0, 10);
    res.json(top10);
  } catch (error) {
    next(error);
  }
};

// Mentors are listed within the caller's department; a super admin sees all.
const mentorScope = async (user) => {
  const scope = await loadScope(user);
  if (scope.role === 'SUPER_ADMIN' || scope.departmentIds.length === 0) return {};
  return { departmentId: { in: scope.departmentIds } };
};

// GET all mentors
export const getMentors = async (req, res, next) => {
  try {
    const mentors = await prisma.user.findMany({
      where: { role: 'MENTOR', ...(await mentorScope(req.user)) },
      include: {
        _count: {
          select: { students: { where: { status: 'ACTIVE' } } }
        }
      }
    });
    const mapped = mentors.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      assignedStudentsCount: m._count.students
    }));
    res.json(mapped);
  } catch (error) {
    next(error);
  }
};
