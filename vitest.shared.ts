/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * The Vitest settings every package under `packages/` shares: specs next to the
 * sources in `src/`, and 100% coverage required of each file.
 */
export const packageTest = {
  globals: true,
  root: '.',
  include: ['src/**/*.spec.ts'],
  coverage: {
    enabled: true,
    include: ['src/**/*.ts'],
    thresholds: {
      perFile: true,
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
};
