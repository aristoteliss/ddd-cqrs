/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Behavior ordering: a behavior that records a fact about the operation sits outside a
 * behavior that can re-execute it. `AuditBehavior` writes one record per invocation, so
 * inside `ResilienceBehavior` a delete that fails twice before succeeding would write
 * three records for one logical operation.
 */

import {
  isTransientOperationError,
  TransientOperationError,
} from '@cqrs-ddd/core/domain';
import { CommandHandler, createCqrs } from '@cqrs-ddd/cqrs';
import { pipelineOf, UsePipeline } from '@cqrs-ddd/pipeline';
import { AuditBehavior, audit } from '@cqrs-ddd/pipeline-audit';
import { ResilienceBehavior, resilience } from '@cqrs-ddd/pipeline-resilience';
import { beforeEach, describe, expect, it } from 'vitest';
import { DeleteRoleHandler } from '../../src/roles/application/cqrs/commands/delete-role.handler.js';
import { DeleteUserHandler } from '../../src/users/application/cqrs/commands/delete-user.handler.js';

const silent = { log() {}, warn() {}, error() {} };

const records: Array<{ action: string; outcome: string }> = [];

const recordingSink = {
  async write(record: { action: string; outcome: string }) {
    records.push({ action: record.action, outcome: record.outcome });
  },
};

class FlakyDeleteCommand {}

let attempts = 0;

/** Mirrors the reference handlers' declaration order. */
@CommandHandler(FlakyDeleteCommand)
@UsePipeline(
  audit({ action: 'thing.delete' }),
  resilience({
    handle: isTransientOperationError,
    retry: {
      maxAttempts: 3,
      replaySafe: true,
      backoff: { type: 'constant', delay: 0 },
    },
  }),
)
class FlakyDeleteHandler {
  async execute(_command: FlakyDeleteCommand) {
    attempts += 1;
    if (attempts < 3) {
      throw new TransientOperationError('database unavailable');
    }
    return 'deleted';
  }
}

describe('audit records per logical operation, not per retry', () => {
  beforeEach(() => {
    records.length = 0;
    attempts = 0;
  });

  it('writes exactly one record when the operation succeeds after retries', async () => {
    const cqrs = createCqrs({
      logger: silent,
      bootstrapLogLevel: 'none',
      behaviors: [
        new AuditBehavior(recordingSink as never, undefined, silent),
        new ResilienceBehavior(undefined, silent),
      ],
    });
    cqrs.register(new FlakyDeleteHandler());

    await expect(
      cqrs.commandBus.execute(new FlakyDeleteCommand()),
    ).resolves.toBe('deleted');

    expect(attempts).toBe(3);
    expect(records).toEqual([{ action: 'thing.delete', outcome: 'success' }]);
  });
});

describe('reference handlers declare audit outside resilience', () => {
  it.each([
    ['DeleteUserHandler', DeleteUserHandler],
    ['DeleteRoleHandler', DeleteRoleHandler],
  ])('%s audits outside its retry policy', (_name, handler) => {
    const order = pipelineOf(handler).types.map((type) => type.name);

    expect(order).toContain('AuditBehavior');
    expect(order).toContain('ResilienceBehavior');
    expect(order.indexOf('AuditBehavior')).toBeLessThan(
      order.indexOf('ResilienceBehavior'),
    );
  });
});
