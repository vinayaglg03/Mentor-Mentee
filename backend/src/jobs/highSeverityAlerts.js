import prisma from '../prismaClient.js';
import logger from '../logger.js';
import config from '../config.js';
import { sendMail, unsubscribeUrl } from '../lib/mailer.js';
import { ensureUnsubscribeToken } from '../lib/digests.js';

// "Email me when a high-severity alert is raised", from Settings.
//
// Deliberately a job rather than a hook on alert creation. Alerts are written
// inside the same transaction as a mark or an attendance figure, and a bulk
// import writes thousands in a row: sending from there would put an SMTP call
// inside a database transaction and land forty separate emails in a mentor's
// inbox from one spreadsheet. Batching from outside gives one email that says
// what happened.
//
// Each mentor carries their own watermark, so switching the setting on does
// not deliver a backlog, and nothing is sent twice.

const MAX_LISTED = 15;

const render = ({ name, alerts, token }) => {
  const lines = [
    `Hello ${name},`,
    '',
    alerts.length === 1
      ? 'One of your mentees has a new high-severity alert:'
      : `${alerts.length} of your mentees have new high-severity alerts:`,
    '',
  ];

  for (const alert of alerts.slice(0, MAX_LISTED)) {
    const student = alert.semesterRecord.student;
    lines.push(`  ${student.rollNumber}  ${student.name}`);
    lines.push(`    ${alert.message}`);
    lines.push(`    ${config.appUrl}/student/${student.id}`);
    lines.push('');
  }

  if (alerts.length > MAX_LISTED) {
    lines.push(`  ...and ${alerts.length - MAX_LISTED} more on your dashboard.`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`Turn these off in Settings, or unsubscribe from everything: ${unsubscribeUrl(token)}`);

  return lines.join('\n');
};

export const runHighSeverityNotifications = async ({ now = new Date() } = {}) => {
  const subscribers = await prisma.userPreference.findMany({
    where: { notifyHighSeverity: true },
    select: {
      userId: true,
      highSeverityNotifiedAt: true,
      user: {
        select: { id: true, name: true, email: true, approved: true, unsubscribeToken: true },
      },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const subscriber of subscribers) {
    const mentor = subscriber.user;

    if (!mentor?.approved || !mentor.email) { skipped++; continue; }

    // First run after switching it on: start from now, so nobody is emailed
    // a year of history they have already seen on the dashboard.
    const since = subscriber.highSeverityNotifiedAt;

    if (!since) {
      await prisma.userPreference.update({
        where: { userId: subscriber.userId },
        data: { highSeverityNotifiedAt: now },
      });
      skipped++;
      continue;
    }

    const alerts = await prisma.alert.findMany({
      where: {
        severity: 'HIGH',
        resolved: false,
        timestamp: { gt: since },
        semesterRecord: { student: { status: 'ACTIVE', mentorId: mentor.id } },
      },
      select: {
        id: true,
        message: true,
        timestamp: true,
        semesterRecord: {
          select: { student: { select: { id: true, name: true, rollNumber: true } } },
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    if (alerts.length === 0) { skipped++; continue; }

    const token = await ensureUnsubscribeToken(mentor);

    await sendMail({
      to: mentor.email,
      subject: alerts.length === 1
        ? 'AMIS: a mentee has a new high-severity alert'
        : `AMIS: ${alerts.length} new high-severity alerts`,
      text: render({ name: mentor.name, alerts, token }),
    });

    await prisma.userPreference.update({
      where: { userId: subscriber.userId },
      data: { highSeverityNotifiedAt: now },
    });

    sent++;
  }

  const result = { sent, skipped, considered: subscribers.length };
  logger.info(result, 'High-severity alert notifications');

  return result;
};

// `npm run job:high-alerts`
if (process.argv[1] && process.argv[1].endsWith('highSeverityAlerts.js')) {
  runHighSeverityNotifications()
    .then(result => console.log('high-severity notifications:', JSON.stringify(result)))
    .catch(error => {
      console.error('High-severity notification run failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
