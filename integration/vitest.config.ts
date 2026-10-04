/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { defineConfig } from 'vitest/config';

const applications = [
  'payments',
  'library',
  'inventory',
  'profiles',
  'members',
  'nestjs',
];

export default defineConfig({
  // @cqrs-ddd/nestjs is linked from its workspace folder, whose NestJS copy differs
  // from the application's; an installed adapter shares the application's one.
  resolve: { dedupe: ['@nestjs/common', '@nestjs/core', '@nestjs/cqrs'] },
  test: {
    globals: true,
    root: '.',
    include: [
      'checks/**/*.spec.ts',
      ...applications.map((folder) => `${folder}/**/*.spec.ts`),
      'nestjs/**/*.e2e-spec.ts',
    ],
    coverage: {
      enabled: true,
      include: applications.map((folder) => `${folder}/**/*.ts`),
      exclude: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
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
