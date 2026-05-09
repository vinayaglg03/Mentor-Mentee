import prisma from '../prismaClient.js';

export const getHODAnalytics = async (req, res) => {
  try {
    const totalStudents = await prisma.student.count();
    const totalMentors = await prisma.user.count({ where: { role: 'MENTOR' } });
    
    // 1. Performance Overview (Global) - Now querying via SemesterRecord links
    const recentScores = await prisma.score.findMany({
      where: { finalScore: { not: null } },
      select: { finalScore: true }
    });

    let passCount = 0;
    let failCount = 0;
    recentScores.forEach(s => {
      if (s.finalScore >= 40) passCount++;
      else failCount++;
    });

    // 2. Alert Stats
    const totalAlerts = await prisma.alert.count({ where: { resolved: false } });
    const alertsByTypeRow = await prisma.alert.groupBy({
      by: ['type'],
      _count: { type: true },
      where: { resolved: false }
    });
    const alertsByType = alertsByTypeRow.map(a => ({ type: a.type, count: a._count.type }));

    // 3. Top Performers (based on avg final score across all semester records)
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
        averageScore: Math.round(avgScore * 10) / 10,
        mentorName: student.mentor?.name || 'Unassigned'
      };
    });
    const topPerformers = performance.sort((a, b) => b.averageScore - a.averageScore).slice(0, 5);

    // 4. Mentor-wise Student Distribution
    const mentors = await prisma.user.findMany({
      where: { role: 'MENTOR' },
      include: { _count: { select: { students: true } } }
    });
    const mentorDistribution = mentors.map(m => ({ name: m.name, studentCount: m._count.students }));

    // 5. Recent Critical Alerts
    const recentAlerts = await prisma.alert.findMany({
      where: { resolved: false, severity: 'HIGH' },
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
    res.status(500).json({ error: error.message });
  }
};
