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

// Error handling backend middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
