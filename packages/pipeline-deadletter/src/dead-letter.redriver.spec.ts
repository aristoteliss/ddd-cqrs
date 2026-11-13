/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@cqrs-ddd/pipeline';
import { describe, expect, it, vi } from 'vitest';
import { DeadLetterBehavior } from './dead-letter.behavior.js';
import { DeadLetterRedriver } from './dead-letter.redriver.js';
import { DeadLetterRedriveError } from './errors/dead-letter-redrive.error.js';
import { currentRedriveId } from './helpers/redrive-scope.js';
import type {
  DeadLetterRecord,
  DeadLetterStore,
} from './interfaces/dead-letter-transport.interface.js';

class UserCreatedEvent {
  constructor(readonly userId: string) {}
  label(): string {
    return `user ${this.userId}`;
  }
}

function makeRecord(
  overrides: Partial<DeadLetterRecord> = {},
): DeadLetterRecord {
  return {
    id: 'dl-1',
    correlationId: 'corr-1',
    requestKind: 'event',
    requestName: 'UserCreatedEvent',
    handlerName: 'SendWelcomeEmailHandler',
    payload: { userId: 'u-1' },
    error: { name: 'Error', message: 'smtp down' },
    failedAt: '2026-01-01T00:00:00.000Z',
    attempts: 0,
    status: 'open',
    payloadRedacted: false,
    ...overrides,
  };
}

function memoryStore(record?: DeadLetterRecord) {
  const records = new Map<string, DeadLetterRecord>();
  const claimed = new Set<string>();
  if (record) records.set(record.id, record);
  const store: DeadLetterStore = {
    send: vi.fn(async (sent: DeadLetterRecord) => {
      records.set(sent.id, sent);
    }),
    get: vi.fn(async (id: string) => records.get(id)),
    list: vi.fn(async () => [...records.values()]),
    claim: vi.fn(async (id: string) => {
      if (records.get(id)?.status !== 'open' || claimed.has(id)) return false;
      claimed.add(id);
      return true;
    }),
    recordAttempt: vi.fn(async (id, error) => {
      claimed.delete(id);
      const current = records.get(id) as DeadLetterRecord;
      records.set(id, {
        ...current,
        attempts: current.attempts + 1,
        lastError: error,
      });
    }),
    markResolved: vi.fn(async (id: string) => {
      claimed.delete(id);
      const current = records.get(id) as DeadLetterRecord;
      records.set(id, { ...current, status: 'resolved' });
    }),
  };
  return { store, records };
}

function memoryStoreThatCannotRecord(failure: Error): DeadLetterStore {
  const { store } = memoryStore(makeRecord());
  vi.mocked(store.recordAttempt).mockRejectedValue(failure);
  return store;
}

describe('DeadLetterRedriver', () => {
  it('rebuilds the request as an instance of its class, dispatches it and resolves the record', async () => {
    const { store, records } = memoryStore(makeRecord());
    const event = vi.fn((request: unknown, _record: DeadLetterRecord) => {
      expect(currentRedriveId()).toBe('dl-1');
      return (request as UserCreatedEvent).label();
    });
    const redriver = new DeadLetterRedriver(store, {
      requestTypes: [UserCreatedEvent],
      dispatch: { event },
    });

    await expect(redriver.redrive('dl-1')).resolves.toEqual({
      id: 'dl-1',
      response: 'user u-1',
    });

    const [request, record] = event.mock.calls[0] ?? [];
    expect(request).toBeInstanceOf(UserCreatedEvent);
    expect((record as DeadLetterRecord).handlerName).toBe(
      'SendWelcomeEmailHandler',
    );
    expect(records.get('dl-1')?.status).toBe('resolved');
    expect(currentRedriveId()).toBeUndefined();
  });

  it('counts a failed attempt, keeps its error and rethrows it', async () => {
    const { store, records } = memoryStore(makeRecord());
    const failure = new TypeError('still down');
    const redriver = new DeadLetterRedriver(store, {
      requestTypes: [UserCreatedEvent],
      dispatch: { event: () => Promise.reject(failure) },
    });

    await expect(redriver.redrive('dl-1')).rejects.toBe(failure);
    await expect(
      new DeadLetterRedriver(store, {
        requestTypes: [UserCreatedEvent],
        dispatch: { event: () => Promise.reject('offline') },
      }).redrive('dl-1'),
    ).rejects.toBe('offline');

    expect(records.get('dl-1')).toMatchObject({
      attempts: 2,
      status: 'open',
      lastError: { name: 'unknown', message: 'offline' },
    });
    expect(store.recordAttempt).toHaveBeenNthCalledWith(1, 'dl-1', {
      name: 'TypeError',
      message: 'still down',
    });
  });

  it('refuses, without dispatching, a record it cannot redrive', async () => {
    const dispatch = vi.fn();
    const cases: Array<[DeadLetterRecord | undefined, string]> = [
      [undefined, 'no such dead letter'],
      [makeRecord({ status: 'resolved' }), 'it is already resolved'],
      [
        makeRecord({ requestName: 'OtherEvent' }),
        'request type OtherEvent is not registered in requestTypes',
      ],
      [
        makeRecord({ requestKind: 'command' }),
        'no dispatch is configured for command requests',
      ],
      [
        makeRecord({ payloadRedacted: true }),
        'its payload was redacted; configure rebuild to restore the redacted values',
      ],
    ];

    for (const [record, reason] of cases) {
      const { store } = memoryStore(record);
      const redriver = new DeadLetterRedriver(store, {
        requestTypes: [UserCreatedEvent],
        dispatch: { event: dispatch },
      });
      const error = await redriver.redrive('dl-1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DeadLetterRedriveError);
      expect(error).toMatchObject({
        deadLetterId: 'dl-1',
        reason,
        message: `Cannot redrive dead letter dl-1: ${reason}`,
      });
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches one time when two redrives of one record run together', async () => {
    const { store, records } = memoryStore(makeRecord());
    const event = vi.fn(async () => 'sent');
    const redriver = new DeadLetterRedriver(store, {
      requestTypes: [UserCreatedEvent],
      dispatch: { event },
    });

    const outcomes = await Promise.allSettled([
      redriver.redrive('dl-1'),
      redriver.redrive('dl-1'),
    ]);

    expect(event).toHaveBeenCalledTimes(1);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const refused = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(refused?.reason).toBeInstanceOf(DeadLetterRedriveError);
    expect(refused?.reason).toMatchObject({
      reason: 'another redrive holds it, or it is resolved',
    });
    expect(records.get('dl-1')?.status).toBe('resolved');
  });

  it('claims the record for five minutes, or for the configured leaseMs', async () => {
    const first = memoryStore(makeRecord());
    const second = memoryStore(makeRecord());
    const options = {
      requestTypes: [UserCreatedEvent],
      dispatch: { event: vi.fn() },
    };

    await new DeadLetterRedriver(first.store, options).redrive('dl-1');
    await new DeadLetterRedriver(second.store, {
      ...options,
      leaseMs: 1_000,
    }).redrive('dl-1');

    expect(first.store.claim).toHaveBeenCalledWith('dl-1', 300_000);
    expect(second.store.claim).toHaveBeenCalledWith('dl-1', 1_000);
  });

  it('frees the record after a failed attempt, so that it can be redriven again', async () => {
    const { store } = memoryStore(makeRecord());
    const event = vi
      .fn()
      .mockRejectedValueOnce(new Error('still down'))
      .mockResolvedValueOnce('sent');
    const redriver = new DeadLetterRedriver(store, {
      requestTypes: [UserCreatedEvent],
      dispatch: { event },
    });

    await expect(redriver.redrive('dl-1')).rejects.toThrow('still down');
    await expect(redriver.redrive('dl-1')).resolves.toMatchObject({
      response: 'sent',
    });
  });

  it('rethrows the handling error and logs the store error when the attempt cannot be recorded', async () => {
    const { store } = memoryStore(makeRecord());
    const failure = new Error('still down');
    const storeFailure = new Error('store down');
    vi.mocked(store.recordAttempt).mockRejectedValue(storeFailure);
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const consoleError = vi.spyOn(console, 'error').mockReturnValue();
    const redriver = new DeadLetterRedriver(store, {
      requestTypes: [UserCreatedEvent],
      dispatch: { event: () => Promise.reject(failure) },
      logger,
    });

    await expect(redriver.redrive('dl-1')).rejects.toBe(failure);

    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      'Failed to record the redrive attempt of dead letter dl-1',
      storeFailure,
    );

    await expect(
      new DeadLetterRedriver(memoryStoreThatCannotRecord(storeFailure), {
        requestTypes: [UserCreatedEvent],
        dispatch: { event: () => Promise.reject(failure) },
      }).redrive('dl-1'),
    ).rejects.toBe(failure);
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      'Failed to record the redrive attempt of dead letter dl-1',
      storeFailure,
    );
    consoleError.mockRestore();
  });

  it('redrives a redacted record through rebuild, which restores the values', async () => {
    const { store } = memoryStore(
      makeRecord({ payloadRedacted: true, payload: { userId: '[REDACTED]' } }),
    );
    const rebuild = vi.fn(() => new UserCreatedEvent('u-restored'));
    const event = vi.fn(
      (request: unknown) => (request as UserCreatedEvent).userId,
    );
    const redriver = new DeadLetterRedriver(store, {
      requestTypes: [UserCreatedEvent],
      dispatch: { event },
      rebuild,
    });

    await expect(redriver.redrive('dl-1')).resolves.toMatchObject({
      response: 'u-restored',
    });
    expect(rebuild).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dl-1' }),
      UserCreatedEvent,
    );
  });

  it('resolves a record without replaying it', async () => {
    const { store, records } = memoryStore(makeRecord());
    const redriver = new DeadLetterRedriver(store, {
      requestTypes: [],
      dispatch: {},
    });

    await redriver.resolve('dl-1');

    expect(records.get('dl-1')?.status).toBe('resolved');
  });

  it('is neither captured again nor swallowed by DeadLetterBehavior during a redrive', async () => {
    const { store, records } = memoryStore(makeRecord());
    const behavior = new DeadLetterBehavior(store);
    const context = {
      correlationId: 'corr-2',
      request: { userId: 'u-1' },
      requestName: 'UserCreatedEvent',
      handlerName: 'SendWelcomeEmailHandler',
      requestKind: 'event',
      items: new Map(),
      getBehaviorOptions: vi.fn().mockReturnValue({ rethrow: false }),
    } as unknown as IPipelineContext;
    const failure = new Error('smtp still down');
    const redriver = new DeadLetterRedriver(store, {
      requestTypes: [UserCreatedEvent],
      dispatch: {
        event: () => behavior.handle(context, () => Promise.reject(failure)),
      },
    });

    await expect(redriver.redrive('dl-1')).rejects.toBe(failure);

    expect(store.send).not.toHaveBeenCalled();
    expect(records.size).toBe(1);
    expect(records.get('dl-1')?.attempts).toBe(1);
  });
});
