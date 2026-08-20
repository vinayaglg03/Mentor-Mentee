import prisma from '../prismaClient.js';
import { assertMentorHasCapacity } from '../lib/access.js';

// GET all students across all years
export const getAllStudents = async (req, res) => {
  try {
    const students = await prisma.student.findMany({
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
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// GET unassigned students
export const getUnassignedStudents = async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      where: { mentorId: null },
      orderBy: { rollNumber: 'asc' }
    });
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// PUT Assign student to mentor
export const assignStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { mentorId } = req.body;

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
export const getAtRiskStudents = async (req, res) => {
  try {
    const atRisk = await prisma.student.findMany({
      where: {
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
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// GET Top Performers Insight
export const getTopPerformers = async (req, res) => {
  try {
    const studentsWithRecords = await prisma.student.findMany({
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
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// GET all mentors
export const getMentors = async (req, res) => {
  try {
    const mentors = await prisma.user.findMany({
      where: { role: 'MENTOR' },
      include: {
        _count: {
          select: { students: true }
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
    res.status(500).json({ error: 'Server error' });
  }
};
