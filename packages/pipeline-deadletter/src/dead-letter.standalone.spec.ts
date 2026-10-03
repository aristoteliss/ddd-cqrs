/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createPipeline } from '@cqrs-ddd/pipeline';
import { describe, expect, it } from 'vitest';
import { DeadLetterBehavior } from './dead-letter.behavior.js';
import { deadLetter } from './helpers/dead-letter.intent.js';
import type {
  DeadLetterRecord,
  DeadLetterTransport,
} from './interfaces/dead-letter-transport.interface.js';

describe('DeadLetterBehavior on wrapped functions', () => {
  it('captures a failed event reaction and rethrows its error', async () => {
    const records: DeadLetterRecord[] = [];
    const transport: DeadLetterTransport = {
      send: async (record) => {
        records.push(record);
      },
    };
    const pipeline = createPipeline({
      behaviors: [new DeadLetterBehavior(transport)],
    });
    const sendWelcome = pipeline.wrap(
      { name: 'sendWelcome', kind: 'event' },
      deadLetter(),
    )(async (_event: { userId: string }) => {
      throw new Error('mail server down');
    });

    await expect(sendWelcome({ userId: 'u1' })).rejects.toThrow(
      'mail server down',
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      requestName: 'sendWelcome',
      requestKind: 'event',
    });
  });

  it('cannot be built without a transport', () => {
    expect(() => new DeadLetterBehavior(undefined as never)).toThrow(
      'DeadLetterBehavior requires a dead-letter transport',
    );
  });
});
