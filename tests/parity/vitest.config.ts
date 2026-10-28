import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['specs/**/*.spec.ts'],
    setupFiles: ['src/setup.ts'],
    // One shared database, reset per file: files must not run alongside each other.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
