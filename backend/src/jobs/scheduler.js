import cron from 'node-cron';
import config from '../config.js';
import logger from '../logger.js';
import { runDailyDigests, runWeeklyDigests } from './digestJobs.js';
import { runInactivityCheck } from './inactivityCheck.js';

// In-process scheduling, which is the right size for one instance.
//
// Running more than one instance means every instance fires every job, so
// mentors would get one email per instance. When you scale out, set
// NOTIFICATIONS_SCHEDULE=false and drive the same work from outside:
//
//   30 1 * * *  cd backend && npm run job:digest -- daily
//   0  2 * * 1  cd backend && npm run job:digest -- weekly
//   0  3 * * *  cd backend && npm run job:inactivity
//
// Render cron jobs, a Kubernetes CronJob or plain crontab all work; the jobs
// are ordinary scripts with no dependency on the running server.
const tasks = [];

const schedule = (name, expression, run) => {
  if (!cron.validate(expression)) {
    logger.error({ name, expression }, 'Ignoring an invalid cron expression');
    return;
  }

  const task = cron.schedule(expression, async () => {
    try {
      const result = await run();
      logger.info({ job: name, result }, 'Scheduled job finished');
    } catch (error) {
      logger.error({ job: name, err: error }, 'Scheduled job failed');
    }
  });

  tasks.push({ name, expression, task });
  logger.info({ job: name, expression }, 'Scheduled job registered');
};

export const startScheduler = () => {
  if (!config.notifications.scheduleEnabled) {
    logger.info('In-process scheduler disabled (NOTIFICATIONS_SCHEDULE=false)');
    return [];
  }

  schedule('daily-digest', config.notifications.dailyDigestCron, runDailyDigests);
  schedule('weekly-digest', config.notifications.weeklyDigestCron, runWeeklyDigests);
  schedule('inactivity-check', config.notifications.inactivityCron, runInactivityCheck);

  return tasks;
};

export const stopScheduler = () => {
  for (const { task } of tasks) task.stop();
  tasks.length = 0;
};
