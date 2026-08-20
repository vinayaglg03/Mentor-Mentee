import express from 'express';
import cors from 'cors';
import config from './src/config.js';
import authRoutes from './src/routes/auth.js';
import mentorRoutes from './src/routes/mentors.js';
import studentRoutes from './src/routes/students.js';
import scoreRoutes from './src/routes/scores.js';
import analyticsRoutes from './src/routes/analytics.js';
import alertRoutes from './src/routes/alerts.js';
import subjectRoutes from './src/routes/subjects.js';
import hodRoutes from './src/routes/hod.js';

const app = express();
const PORT = config.port;

// Only these origins may call the API. Requests without an Origin header
// (curl, health checks, server-to-server) are allowed through.
const allowedOrigins = config.corsOrigins;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} is not allowed by CORS`));
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Central error handler. Typed errors carry their own status; anything else
// is logged server-side and reported to the client as a generic 500 so that
// database internals never reach the browser.
app.use((err, req, res, next) => {
  if (err && Number.isInteger(err.status) && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
