import app from './src/app.js';
import config from './src/config.js';
import logger from './src/logger.js';

app.listen(config.port, '0.0.0.0', () => {
  logger.info(`Server running on port ${config.port}`);
});
