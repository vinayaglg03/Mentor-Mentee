import crypto from 'node:crypto';
import prisma from '../prismaClient.js';
import config from '../config.js';
import { sendMail, unsubscribeUrl } from './mailer.js';

const dayMs = 24 * 60 * 60 * 1000;

const daysAgo = (days) => new Date(Date.now() - days * dayMs);

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

// Issued lazily so an account created before this feature still gets a
// working unsubscribe link the first time it is emailed.
export const ensureUnsubscribeToken = async (user) => {
  if (user.unsubscribeToken) return user.unsubscribeToken;

  const token = crypto.randomBytes(24).toString('hex');
  await prisma.user.update({ where: { id: user.id }, data: { unsubscribeToken: token } });
  return token;
};

// --- what goes in a mentor's daily digest -------------------------------

export const buildMentorDigest = async (mentorId) => {
  const students = await prisma.student.findMany({
    where: { mentorId, status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      rollNumber: true,
      semesterRecords: {
        orderBy: [{ academicYear: 'desc' }, { semester: 'desc' }],
        select: {
          id: true,
          semester: true,
          alerts: {
            where: { resolved: false },
            orderBy: { timestamp: 'desc' },
            select: { id: true, type: true, severity: true, message: true, timestamp: true },
          },
          progressLogs: {
            orderBy: { date: 'desc' },
            take: 1,
            select: { date: true, followUpDate: true },
          },
        },
      },
    },
  });

  const alerts = [];
  const quiet = [];
  const cutoff = daysAgo(config.notifications.inactivityDays);

  for (const student of students) {
    const openAlerts = student.semesterRecords.flatMap(record => record.alerts);

    if (openAlerts.length > 0) {
      alerts.push({
        student: { id: student.id, name: student.name, rollNumber: student.rollNumber },
        high: openAlerts.filter(alert => alert.severity === 'HIGH'),
        other: openAlerts.filter(alert => alert.severity !== 'HIGH'),
      });
    }

    const lastLog = student.semesterRecords
      .flatMap(record => record.progressLogs)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

    if (!lastLog || new Date(lastLog.date) < cutoff) {
      quiet.push({
        student: { id: student.id, name: student.name, rollNumber: student.rollNumber },
        lastInteraction: lastLog?.date ?? null,
      });
    }
  }

  // Follow-ups the mentor set themselves, due in the next week or overdue.
  const followUps = await prisma.progressLog.findMany({
    where: {
      mentorId,
      followUpDate: { not: null, lte: new Date(Date.now() + 7 * dayMs) },
      semesterRecord: { student: { status: 'ACTIVE' } },
    },
    orderBy: { followUpDate: 'asc' },
    select: {
      id: true,
      followUpDate: true,
      remark: true,
      actionItems: true,
      semesterRecord: { select: { student: { select: { id: true, name: true, rollNumber: true } } } },
    },
  });

  return {
    alerts,
    quiet,
    followUps: followUps.map(log => ({
      student: log.semesterRecord.student,
      followUpDate: log.followUpDate,
      actionItems: log.actionItems,
      remark: log.remark,
    })),
    isEmpty: alerts.length === 0 && quiet.length === 0 && followUps.length === 0,
  };
};

export const renderMentorDigest = ({ name, digest, token }) => {
  const lines = [`Good morning ${name},`, ''];

  if (digest.alerts.length > 0) {
    lines.push(`Unresolved alerts (${digest.alerts.length} student(s)):`);
    for (const row of digest.alerts) {
      lines.push(`  ${row.student.rollNumber} ${row.student.name}`);
      for (const alert of [...row.high, ...row.other]) {
        lines.push(`    [${alert.severity}] ${alert.message}`);
      }
    }
    lines.push('');
  }

  if (digest.followUps.length > 0) {
    lines.push('Follow-ups due:');
    for (const followUp of digest.followUps) {
      lines.push(
        `  ${formatDate(followUp.followUpDate)} - ${followUp.student.rollNumber} ${followUp.student.name}` +
        (followUp.actionItems ? `: ${followUp.actionItems}` : '')
      );
    }
    lines.push('');
  }

  if (digest.quiet.length > 0) {
    lines.push(`No interaction logged in ${config.notifications.inactivityDays}+ days:`);
    for (const row of digest.quiet) {
      lines.push(
        `  ${row.student.rollNumber} ${row.student.name}` +
        (row.lastInteraction ? ` (last: ${formatDate(row.lastInteraction)})` : ' (never)')
      );
    }
    lines.push('');
  }

  lines.push(`Open AMIS: ${config.appUrl}`);
  lines.push('');
  lines.push(`To change how often you get this, or to stop it: ${unsubscribeUrl(token)}`);

  return lines.join('\n');
};

// --- what goes in a HOD's weekly digest ----------------------------------

export const buildHodDigest = async (departmentIds) => {
  if (departmentIds.length === 0) return { escalated: [], isEmpty: true };

  const cutoff = daysAgo(config.notifications.escalateAfterDays);

  const alerts = await prisma.alert.findMany({
    where: {
      resolved: false,
      severity: 'HIGH',
      timestamp: { lt: cutoff },
      semesterRecord: { student: { status: 'ACTIVE', departmentId: { in: departmentIds } } },
    },
    orderBy: { timestamp: 'asc' },
    select: {
      id: true,
      type: true,
      message: true,
      timestamp: true,
      semesterRecord: {
        select: {
          student: {
            select: {
              id: true, name: true, rollNumber: true,
              mentor: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });

  const escalated = alerts.map(alert => ({
    alertId: alert.id,
    type: alert.type,
    message: alert.message,
    raisedAt: alert.timestamp,
    ageDays: Math.floor((Date.now() - new Date(alert.timestamp).getTime()) / dayMs),
    student: alert.semesterRecord.student,
    mentor: alert.semesterRecord.student.mentor,
  }));

  return { escalated, isEmpty: escalated.length === 0 };
};

export const renderHodDigest = ({ name, digest, token }) => {
  const lines = [
    `${name},`,
    '',
    `${digest.escalated.length} high-severity alert(s) have been open for more than ` +
    `${config.notifications.escalateAfterDays} days:`,
    '',
  ];

  for (const item of digest.escalated) {
    lines.push(`  ${item.student.rollNumber} ${item.student.name} (${item.ageDays} days)`);
    lines.push(`    ${item.message}`);
    lines.push(`    Mentor: ${item.mentor?.name ?? 'Unassigned'}`);
  }

  lines.push('');
  lines.push(`Open AMIS: ${config.appUrl}`);
  lines.push('');
  lines.push(`To change how often you get this, or to stop it: ${unsubscribeUrl(token)}`);

  return lines.join('\n');
};

// --- sending -------------------------------------------------------------

const wantsDigest = (user, frequency) => {
  if (user.digestFrequency === 'OFF') return false;
  return user.digestFrequency === frequency;
};

// One email per mentor, not one per alert.
export const sendMentorDigests = async ({ frequency = 'DAILY' } = {}) => {
  const mentors = await prisma.user.findMany({
    where: { approved: true, digestFrequency: frequency, role: { in: ['MENTOR', 'COORDINATOR'] } },
    select: { id: true, name: true, email: true, digestFrequency: true, unsubscribeToken: true },
  });

  let sent = 0;
  let skipped = 0;

  for (const mentor of mentors) {
    if (!wantsDigest(mentor, frequency)) { skipped++; continue; }

    const digest = await buildMentorDigest(mentor.id);
    if (digest.isEmpty) { skipped++; continue; }

    const token = await ensureUnsubscribeToken(mentor);

    await sendMail({
      to: mentor.email,
      subject: `AMIS: ${digest.alerts.length} student(s) need attention`,
      text: renderMentorDigest({ name: mentor.name, digest, token }),
    });

    await prisma.user.update({ where: { id: mentor.id }, data: { lastDigestAt: new Date() } });
    sent++;
  }

  return { sent, skipped, considered: mentors.length };
};

export const sendHodDigests = async () => {
  const hods = await prisma.user.findMany({
    where: { approved: true, role: { in: ['HOD', 'SUPER_ADMIN'] }, digestFrequency: { not: 'OFF' } },
    select: {
      id: true, name: true, email: true, digestFrequency: true, unsubscribeToken: true,
      departmentId: true,
      headedDepartments: { select: { id: true } },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const hod of hods) {
    const departmentIds = [...new Set([hod.departmentId, ...hod.headedDepartments.map(d => d.id)].filter(Boolean))];

    // A super admin with no department of their own gets the whole institution.
    const scope = departmentIds.length > 0
      ? departmentIds
      : (await prisma.department.findMany({ select: { id: true } })).map(d => d.id);

    const digest = await buildHodDigest(scope);
    if (digest.isEmpty) { skipped++; continue; }

    const token = await ensureUnsubscribeToken(hod);

    await sendMail({
      to: hod.email,
      subject: `AMIS: ${digest.escalated.length} alert(s) still open after ${config.notifications.escalateAfterDays} days`,
      text: renderHodDigest({ name: hod.name, digest, token }),
    });

    await prisma.user.update({ where: { id: hod.id }, data: { lastDigestAt: new Date() } });
    sent++;
  }

  return { sent, skipped, considered: hods.length };
};
