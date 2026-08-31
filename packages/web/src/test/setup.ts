// src/test/setup.ts
// Vitest setup: registers jest-dom matchers on vitest's expect.
// The /vitest entry is the version meant for vitest (no global `expect`
// available unless globals:true) - it extends @vitest/expect directly.

import '@testing-library/jest-dom/vitest';
