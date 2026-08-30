import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    // checks shell out to system commands - keep timeout generous
    testTimeout: 15000,
  },
});
