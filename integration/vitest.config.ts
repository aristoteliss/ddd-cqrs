/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { defineConfig } from 'vitest/config';

const applications = [
  'payments',
  'library',
  'inventory',
  'profiles',
  'members',
];

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: [
      'checks/**/*.spec.ts',
      ...applications.map((folder) => `${folder}/**/*.spec.ts`),
    ],
    coverage: {
      enabled: true,
      include: applications.map((folder) => `${folder}/**/*.ts`),
      exclude: ['**/*.spec.ts'],
      thresholds: {
        perFile: true,
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
