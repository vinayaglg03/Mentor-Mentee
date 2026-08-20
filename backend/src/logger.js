import pino from 'pino';

// Structured logs. Never log request bodies or decoded tokens: they carry
// student and mentor personal data.
const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', '*.password'],
    remove: true,
  },
});

export default logger;
