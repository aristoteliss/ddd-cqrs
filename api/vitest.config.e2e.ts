/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { defineConfig } from 'vitest/config';

/**
 * The end-to-end suites: each boots the real application against throwaway libSQL
 * databases and a Redis container started with Testcontainers, then drives its HTTP
 * surface with supertest. They need Docker, so `pnpm test` leaves them out.
 */
export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
    server: {
      deps: { external: [/\/packages\/[^/]+\/dist\//] },
    },
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    pool: 'forks',
  },
});
