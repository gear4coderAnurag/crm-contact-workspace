import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['tests/setup.ts'],
    // one shared crm_test DB, so test files must not run in parallel
    fileParallelism: false,
  },
});
