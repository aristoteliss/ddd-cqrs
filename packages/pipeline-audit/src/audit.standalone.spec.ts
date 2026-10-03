/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createPipeline } from '@cqrs-ddd/pipeline';
import { describe, expect, it, vi } from 'vitest';
import { AuditBehavior } from './audit.behavior.js';
import { AUDIT_OUTCOMES, AUDIT_SEVERITY } from './constants/tokens.js';
import { audit } from './helpers/audit.intent.js';
import { LogAuditSink } from './sinks/log.sink.js';

describe('AuditBehavior on wrapped functions', () => {
  it('writes an audit record of a wrapped command through the default log sink', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const pipeline = createPipeline({
        behaviors: [new AuditBehavior(new LogAuditSink())],
      });
      const rename = pipeline.wrap(
        { name: 'renameUser', kind: 'command' },
        audit({ action: 'user.rename', severity: AUDIT_SEVERITY.HIGH }),
      )(async (input: { id: string; name: string }) => input.name);

      await expect(rename({ id: 'u1', name: 'Ann' })).resolves.toBe('Ann');
      const line = String(log.mock.calls.at(-1)?.[0]);
      expect(line).toContain('user.rename');
      expect(line).toContain(AUDIT_OUTCOMES.SUCCESS);
      expect(line).toContain(AUDIT_SEVERITY.HIGH);
    } finally {
      log.mockRestore();
    }
  });

  it('cannot be built without a sink', () => {
    expect(() => new AuditBehavior(undefined as never)).toThrow(
      'AuditBehavior requires an audit sink',
    );
  });
});
