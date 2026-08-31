// vitest.config.js
// Test runner config for the web dashboard (vitest 3 + jsdom).
// Reuses the react plugin from the vite config so TSX transforms match
// the dev/build pipeline. Tests live next to their sources under src/**.

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Tests never talk to the real API - fetch is mocked per test.
    testTimeout: 10000,
  },
});
