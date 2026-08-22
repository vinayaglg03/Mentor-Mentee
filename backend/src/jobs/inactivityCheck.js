import prisma from '../prismaClient.js';
import config from '../config.js';

const INACTIVITY_DAYS = config.notifications.inactivityDays;

// Raises an INACTIVE alert on every current semester record that has had no
// progress log for INACTIVITY_DAYS. Runs as a job so that reading a student
// never writes to the database.
export const runInactivityCheck = async () => {
  const students = await prisma.student.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      semesterRecords: {
        orderBy: { semester: 'desc' },
        take: 1,
        select: {
          id: true,
          createdAt: true,
          progressLogs: { orderBy: { date: 'desc' }, take: 1, select: { date: true } },
          alerts: { where: { type: 'INACTIVE', resolved: false }, select: { id: true } }
        }
      }
    }
  });

  const now = new Date();
  let scanned = 0;
  let alertsCreated = 0;

  for (const student of students) {
    const record = student.semesterRecords[0];
    if (!record) continue;

    scanned++;
    if (record.alerts.length > 0) continue;

    const lastActivity = record.progressLogs[0]
      ? new Date(record.progressLogs[0].date)
      : new Date(record.createdAt);
    const diffDays = (now - lastActivity) / (1000 * 60 * 60 * 24);

    if (diffDays > INACTIVITY_DAYS) {
      await prisma.alert.create({
        data: {
          semesterRecordId: record.id,
          type: 'INACTIVE',
          severity: 'HIGH',
          message: `No progress logs recorded in the last ${INACTIVITY_DAYS} days for this semester.`
        }
      });
      alertsCreated++;
    }
  }

  return { scanned, alertsCreated };
};

// `npm run job:inactivity`
if (process.argv[1] && process.argv[1].endsWith('inactivityCheck.js')) {
  runInactivityCheck()
    .then(result => {
      console.log(`Inactivity check complete: scanned ${result.scanned} semester records, created ${result.alertsCreated} alerts.`);
    })
    .catch(error => {
      console.error('Inactivity check failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
