import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './src/routes/auth.js';
import mentorRoutes from './src/routes/mentors.js';
import studentRoutes from './src/routes/students.js';
import scoreRoutes from './src/routes/scores.js';
import analyticsRoutes from './src/routes/analytics.js';
import alertRoutes from './src/routes/alerts.js';
import subjectRoutes from './src/routes/subjects.js';
import hodRoutes from './src/routes/hod.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

console.log(process.env.JWT_SECRET);
console.log(process.env.DATABASE_URL);
