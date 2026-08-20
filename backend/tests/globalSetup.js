import { execSync } from 'node:child_process';

// Applies the committed migrations to the test database once per run.
export default function setup() {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set.');
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
}
