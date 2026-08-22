import prisma from '../prismaClient.js';
import logger from '../logger.js';
import { sendMentorDigests, sendHodDigests } from '../lib/digests.js';

// One email per mentor per day: unresolved alerts for their mentees, students
// nobody has spoken to in a month, and follow-ups they set themselves.
export const runDailyDigests = async () => {
  const result = await sendMentorDigests({ frequency: 'DAILY' });
  logger.info(result, 'Daily mentor digests');
  return result;
};

// Weekly: the same digest for anyone who asked for it weekly, plus the HOD
// escalation of high alerts nobody has closed.
export const runWeeklyDigests = async () => {
  const mentors = await sendMentorDigests({ frequency: 'WEEKLY' });
  const hods = await sendHodDigests();

  logger.info({ mentors, hods }, 'Weekly digests');
  return { mentors, hods };
};

// `npm run job:digest -- daily|weekly`
if (process.argv[1] && process.argv[1].endsWith('digestJobs.js')) {
  const which = process.argv[2] === 'weekly' ? 'weekly' : 'daily';

  (which === 'weekly' ? runWeeklyDigests() : runDailyDigests())
    .then(result => console.log(`${which} digests:`, JSON.stringify(result)))
    .catch(error => {
      console.error('Digest run failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
