import dotenv from 'dotenv';

dotenv.config();

const errors = [];

const { DATABASE_URL, JWT_SECRET } = process.env;

if (!DATABASE_URL) {
  errors.push('DATABASE_URL is required (PostgreSQL connection string).');
}

if (!JWT_SECRET) {
  errors.push('JWT_SECRET is required.');
} else if (JWT_SECRET.length < 32) {
  errors.push(`JWT_SECRET must be at least 32 characters (got ${JWT_SECRET.length}).`);
}

const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  errors.push(`PORT must be a valid port number (got "${process.env.PORT}").`);
}

if (errors.length > 0) {
  console.error(
    'Invalid environment configuration:\n' +
    errors.map(e => `  - ${e}`).join('\n') +
    '\nSee backend/.env.example for the full list of variables.'
  );
  process.exit(1);
}

const config = {
  databaseUrl: DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecret: JWT_SECRET,
  port,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',').map(s => s.trim()).filter(Boolean),
};

export default config;
