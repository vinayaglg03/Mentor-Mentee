// Runs before any application module is imported, so config.js sees a valid
// environment pointing at the throwaway test database.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Point it at a database that can be wiped, e.g.\n' +
    '  TEST_DATABASE_URL="postgresql://postgres:password@localhost:5432/amis_test"'
  );
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-long-enough-for-config';
process.env.LOG_LEVEL = 'silent';
