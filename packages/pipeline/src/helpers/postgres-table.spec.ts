/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { assertSafeTable } from './postgres-table.js';

describe('assertSafeTable', () => {
  it.each(['audit_log', 'audit.audit_log', '_t1'])(
    'returns the safe name %s unchanged',
    (table) => {
      expect(assertSafeTable(table, 'audit', 'audit_log')).toBe(table);
    },
  );

  it.each(['x; DROP TABLE y', '1table', 'a.b.c', '"quoted"', ''])(
    'refuses the unsafe name %j',
    (table) => {
      expect(() => assertSafeTable(table, 'audit', 'audit_log')).toThrow(
        `Invalid audit table name "${table}". ` +
          'Use an unquoted identifier like "audit_log" or "schema.audit_log".',
      );
    },
  );
});
