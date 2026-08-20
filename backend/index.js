import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { ZodError } from 'zod';
import config from './src/config.js';
import logger from './src/logger.js';
import authRoutes from './src/routes/auth.js';
import mentorRoutes from './src/routes/mentors.js';
import studentRoutes from './src/routes/students.js';
import scoreRoutes from './src/routes/scores.js';
import analyticsRoutes from './src/routes/analytics.js';
import alertRoutes from './src/routes/alerts.js';
import subjectRoutes from './src/routes/subjects.js';
import hodRoutes from './src/routes/hod.js';
import adminRoutes from './src/routes/admin.js';

const app = express();
const PORT = config.port;

// Render and similar hosts sit behind a proxy; without this the rate
// limiter and request logs see the proxy IP for every client.
app.set('trust proxy', 1);

app.use(helmet());
app.use(pinoHttp({ logger }));

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

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Central error handler. Validation and typed errors carry their own status;
// anything else is logged server-side and reported to the client as a generic
// 500 so that database internals never reach the browser.
app.use((err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  if (err && Number.isInteger(err.status) && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on port ${PORT}`);
});
