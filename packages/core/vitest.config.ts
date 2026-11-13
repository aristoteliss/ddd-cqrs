/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { defineConfig } from 'vitest/config';
import { packageTest } from '../../vitest.shared.js';

export default defineConfig({
  test: {
    ...packageTest,
    include: ['**/*.spec.ts'],
    coverage: {
      ...packageTest.coverage,
      include: [
        'index.ts',
        'application/**/*.ts',
        'domain/**/*.ts',
        'http/**/*.ts',
        'persistence/**/*.ts',
        'types/**/*.ts',
      ],
    },
  },
});
