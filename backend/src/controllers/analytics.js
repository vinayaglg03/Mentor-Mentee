import prisma from '../prismaClient.js';
import { studentScopeWhere, loadScope } from '../lib/access.js';

export const getHODAnalytics = async (req, res, next) => {
  try {
    // Every figure below is limited to what this user may see, so a HOD's
    // dashboard is their department's dashboard.
    const scope = await loadScope(req.user);
    const studentWhere = { status: 'ACTIVE', ...(await studentScopeWhere(req.user)) };
    const departmentWhere = scope.role === 'SUPER_ADMIN' || scope.departmentIds.length === 0
      ? {}
      : { departmentId: { in: scope.departmentIds } };

    const totalStudents = await prisma.student.count({ where: studentWhere });
    const totalMentors = await prisma.user.count({ where: { role: 'MENTOR', ...departmentWhere } });
    
    // 1. Performance Overview (Global) - Now querying via SemesterRecord links
    const recentScores = await prisma.score.findMany({
      where: { finalScore: { not: null }, semesterRecord: { student: studentWhere } },
      select: { finalScore: true }
    });

    let passCount = 0;
    let failCount = 0;
    recentScores.forEach(s => {
      if (s.finalScore >= 40) passCount++;
      else failCount++;
    });

    // 2. Alert Stats
    const alertWhere = { resolved: false, semesterRecord: { student: studentWhere } };

    const totalAlerts = await prisma.alert.count({ where: alertWhere });
    const alertsByTypeRow = await prisma.alert.groupBy({
      by: ['type'],
      _count: { type: true },
      where: alertWhere
    });
    const alertsByType = alertsByTypeRow.map(a => ({ type: a.type, count: a._count.type }));

    // 3. Top Performers (based on avg final score across all semester records)
    const studentsWithRecords = await prisma.student.findMany({
      where: studentWhere,
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
        averageScore: Math.round(avgScore * 10) / 10,
        mentorName: student.mentor?.name || 'Unassigned'
      };
    });
    const topPerformers = performance.sort((a, b) => b.averageScore - a.averageScore).slice(0, 5);

    // 4. Mentor-wise Student Distribution
    const mentors = await prisma.user.findMany({
      where: { role: 'MENTOR', ...departmentWhere },
      include: { _count: { select: { students: { where: { status: 'ACTIVE' } } } } }
    });
    const mentorDistribution = mentors.map(m => ({ name: m.name, studentCount: m._count.students }));

    // 5. Recent Critical Alerts
    const recentAlerts = await prisma.alert.findMany({
      where: { ...alertWhere, severity: 'HIGH' },
      take: 5,
      orderBy: { timestamp: 'desc' },
      include: { 
        semesterRecord: { 
          include: { student: { select: { name: true, rollNumber: true } } } 
        } 
      }
    });

    // Flatten alert data for frontend
    const flattenedAlerts = recentAlerts.map(a => ({
      id: a.id,
      type: a.type,
      message: a.message,
      timestamp: a.timestamp,
      student: a.semesterRecord.student
    }));

    res.json({
      totalStudents,
      totalMentors,
      performanceOverview: {
        pass: passCount,
        fail: failCount,
        total: passCount + failCount
      },
      alertStats: {
        totalActive: totalAlerts,
        byType: alertsByType
      },
      topPerformers,
      mentorDistribution,
      recentAlerts: flattenedAlerts
    });

  } catch (error) {
    next(error);
  }
};
