import prisma from '../prismaClient.js';
import { studentScopeWhere, loadScope } from '../lib/access.js';
import { topPerformers as topPerformersQuery, passFailCounts, alertCountsByType, mentorDistribution } from '../lib/analyticsQueries.js';

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
    // Counted in the database rather than by pulling every score row back.
    const { pass: passCount, fail: failCount } = await passFailCounts(req.user);

    // 2. Alert Stats
    const alertWhere = { resolved: false, semesterRecord: { student: studentWhere } };

    const totalAlerts = await prisma.alert.count({ where: alertWhere });
    const alertsByType = await alertCountsByType(req.user);

    // 3 and 4: both aggregated and ordered in SQL, returning only the rows
    // that are shown.
    const topPerformers = await topPerformersQuery(req.user, { limit: 5 });
    const mentorCounts = await mentorDistribution(req.user);

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
      mentorDistribution: mentorCounts,
      recentAlerts: flattenedAlerts
    });

  } catch (error) {
    next(error);
  }
};
