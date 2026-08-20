import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.js'],
    setupFiles: ['./tests/setupEnv.js'],
    // The tests share one database, so they must not run concurrently.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
