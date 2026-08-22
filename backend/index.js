import app from './src/app.js';
import config from './src/config.js';
import logger from './src/logger.js';
import { startScheduler } from './src/jobs/scheduler.js';
import { initMonitoring } from './src/lib/monitoring.js';

// Before anything else, so a crash during startup is still reported.
initMonitoring();

app.listen(config.port, '0.0.0.0', () => {
  logger.info(`Server running on port ${config.port}`);

  // Digests and the inactivity sweep. Set NOTIFICATIONS_SCHEDULE=false and
  // run the jobs externally when you deploy more than one instance.
  startScheduler();
});
