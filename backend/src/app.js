import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import config from './config.js';
import logger from './logger.js';
import authRoutes from './routes/auth.js';
import mentorRoutes from './routes/mentors.js';
import studentRoutes from './routes/students.js';
import scoreRoutes from './routes/scores.js';
import analyticsRoutes from './routes/analytics.js';
import alertRoutes from './routes/alerts.js';
import subjectRoutes from './routes/subjects.js';
import hodRoutes from './routes/hod.js';
import adminRoutes from './routes/admin.js';
import importRoutes from './routes/import.js';
import attendanceRoutes from './routes/attendance.js';
import reportRoutes from './routes/reports.js';
import departmentRoutes from './routes/departments.js';
import auditRoutes from './routes/audit.js';
import notificationRoutes from './routes/notifications.js';
import setupRoutes from './routes/setup.js';
import { health, ready } from './controllers/health.js';
import { reportError } from './lib/monitoring.js';

const app = express();

// Render and similar hosts sit behind a proxy; without this the rate
// limiter and request logs see the proxy IP for every client.
app.set('trust proxy', 1);

app.use(helmet());

// Every request gets an id, echoed in a header and in any error response, so
// a faculty member reporting a problem can quote a reference that finds the
// exact request in the logs.
app.use((req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

app.use(pinoHttp({
  logger,
  genReqId: (req) => req.id,
  customProps: (req) => ({ requestId: req.id, userId: req.user?.id }),
}));

// Only these origins may call the API. Requests without an Origin header
// (curl, health checks, server-to-server) are allowed through.
const allowedOrigins = config.corsOrigins;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    const error = new Error('Origin not allowed by CORS');
    error.status = 403;
    callback(error);
  },
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/mentors', mentorRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/hod', hodRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/import', importRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/setup', setupRoutes);

// Liveness: is the process up and can it reach the database.
app.get('/api/health', health);
// Readiness: is this build safe to send traffic to (migrations applied).
app.get('/api/ready', ready);

// Central error handler. Validation and typed errors carry their own status;
// anything else is logged server-side and reported to the client as a generic
// 500 so that database internals never reach the browser.
app.use((err, req, res, next) => {
  const requestId = req.id;

  if (err instanceof MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'That file is larger than the 10 MB limit.'
      : 'The file upload could not be read.';
    return res.status(400).json({ error: message, requestId });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      requestId,
      details: err.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  if (err && Number.isInteger(err.status) && err.status < 500) {
    return res.status(err.status).json({ error: err.message, requestId });
  }

  logger.error({ err, requestId, method: req.method, url: req.originalUrl }, 'Unhandled error');
  reportError(err, { requestId, method: req.method, url: req.originalUrl, userId: req.user?.id });

  res.status(500).json({
    error: 'Internal Server Error',
    // The only thing the user can usefully tell you about a 500.
    requestId,
  });
});

export default app;
