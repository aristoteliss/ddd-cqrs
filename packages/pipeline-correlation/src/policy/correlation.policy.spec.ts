/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  correlationSource,
  getCorrelationId,
  runWithCorrelationId,
} from '../correlation.store.js';
import { WithCorrelation } from '../decorators/with-correlation.decorator.js';
import {
  type HttpMiddleware,
  httpCorrelation,
} from '../middlewares/http-correlation.middleware.js';
import { configureCorrelation } from './correlation.policy.js';

const UUID = /^[0-9a-f-]{36}$/;

function viaHttp(
  middleware: HttpMiddleware,
  incoming?: string,
): { id: string; responseId: string } {
  const req = {
    headers: incoming === undefined ? {} : { 'x-correlation-id': incoming },
  } as unknown as IncomingMessage;
  let responseId = '';
  const res = {
    setHeader: (_name: string, value: string) => {
      responseId = value;
    },
  } as unknown as ServerResponse;
  let id = '';

  middleware(req, res, () => {
    id = getCorrelationId();
  });

  return { id, responseId };
}

afterEach(() => configureCorrelation());

describe('the built-in check', () => {
  const malformed = [
    ['a CR/LF pair', 'id\r\nx-admin: 1', 'invalid-character'],
    ['a tab', 'id\tx', 'invalid-character'],
    ['a NUL character', 'id\u0000x', 'invalid-character'],
    ['DEL', 'id\u007fx', 'invalid-character'],
    ['a Latin-1 character', 'café', 'invalid-character'],
    ['a character above 0xFF', 'id-\u2028', 'invalid-character'],
    ['a leading space', ' id', 'surrounding-space'],
    ['a trailing space', 'id ', 'surrounding-space'],
  ] as const;

  it.each(malformed)(
    'rejects an id with %s even when the rule accepts every id',
    (_, id, reason) => {
      const onRejected = vi.fn();
      configureCorrelation({ validateIncoming: () => true, onRejected });

      const stored = runWithCorrelationId(id, () =>
        correlationSource.current(),
      );

      expect(stored).toMatch(UUID);
      expect(onRejected).toHaveBeenCalledExactlyOnceWith({
        reason,
        source: 'runWithCorrelationId',
        length: id.length,
      });
    },
  );

  it.each(malformed)(
    'makes correlationSource.run store no id for %s',
    (_, id) => {
      expect(
        correlationSource.run(id, () => correlationSource.current()),
      ).toBeUndefined();
    },
  );

  it('leaves printable ids, inner spaces included, to the application rule', () => {
    configureCorrelation({ validateIncoming: () => true });

    for (const id of ['a b', '<b>"x"</b>', '!~']) {
      expect(runWithCorrelationId(id, getCorrelationId)).toBe(id);
    }
  });
});

describe('configureCorrelation', () => {
  it('leaves runWithCorrelationId and @WithCorrelation to the built-in check until it is called', () => {
    class Worker {
      @WithCorrelation({ path: 'correlationId', logLevel: 'none' })
      handle(_message: { correlationId: string }) {
        return getCorrelationId();
      }
    }
    const long = 'a'.repeat(129);

    expect(runWithCorrelationId('a b', getCorrelationId)).toBe('a b');
    expect(runWithCorrelationId(long, getCorrelationId)).toBe(long);
    expect(new Worker().handle({ correlationId: 'a#b' })).toBe('a#b');
    expect(runWithCorrelationId('a\nb', getCorrelationId)).toMatch(UUID);
  });

  it('keeps the default rule of httpCorrelation and accepts until it is called', () => {
    expect(viaHttp(httpCorrelation(), 'edge:req/1').id).toBe('edge:req/1');
    expect(viaHttp(httpCorrelation(), 'a b').id).toMatch(UUID);
    expect(correlationSource.accepts('a b')).toBe(false);
    expect(correlationSource.accepts('a'.repeat(129))).toBe(false);
  });

  it('applies the default rule to every entry point once called with an empty policy', () => {
    configureCorrelation({});

    expect(runWithCorrelationId('edge:req/1', getCorrelationId)).toBe(
      'edge:req/1',
    );
    expect(runWithCorrelationId('a b', getCorrelationId)).toMatch(UUID);
    expect(runWithCorrelationId('a'.repeat(129), getCorrelationId)).toMatch(
      UUID,
    );
  });

  it('applies the rule to runWithCorrelationId, @WithCorrelation, httpCorrelation and accepts', () => {
    const onRejected = vi.fn();
    configureCorrelation({
      validateIncoming: (id) => id.startsWith('edge-'),
      onRejected,
    });
    class Worker {
      @WithCorrelation({ path: 'correlationId', logLevel: 'none' })
      handle(_message: { correlationId: string }) {
        return getCorrelationId();
      }
    }

    expect(runWithCorrelationId('edge-1', getCorrelationId)).toBe('edge-1');
    expect(runWithCorrelationId('core-1', getCorrelationId)).toMatch(UUID);
    expect(viaHttp(httpCorrelation(), 'core-2').id).toMatch(UUID);
    expect(new Worker().handle({ correlationId: 'core-3' })).toMatch(UUID);
    expect(correlationSource.accepts('edge-4')).toBe(true);
    expect(correlationSource.accepts('core-4')).toBe(false);
    expect(correlationSource.accepts('')).toBe(false);

    expect(onRejected.mock.calls.map(([rejection]) => rejection)).toEqual([
      { reason: 'rule', source: 'runWithCorrelationId', length: 6 },
      { reason: 'rule', source: 'http', length: 6 },
      { reason: 'rule', source: 'Worker.handle', length: 6 },
    ]);
  });

  it('rejects an id longer than maxLength', () => {
    const onRejected = vi.fn();
    configureCorrelation({ maxLength: 8, onRejected });

    expect(runWithCorrelationId('a'.repeat(8), getCorrelationId)).toBe(
      'a'.repeat(8),
    );
    expect(runWithCorrelationId('a'.repeat(9), getCorrelationId)).toMatch(UUID);
    expect(onRejected).toHaveBeenCalledExactlyOnceWith({
      reason: 'too-long',
      source: 'runWithCorrelationId',
      length: 9,
    });
  });

  it('reports a value that is not a string with length 0', () => {
    const onRejected = vi.fn();
    configureCorrelation({ onRejected });

    runWithCorrelationId(42 as never, getCorrelationId);

    expect(onRejected).toHaveBeenCalledExactlyOnceWith({
      reason: 'not-string',
      source: 'runWithCorrelationId',
      length: 0,
    });
  });

  it.each([undefined, null, ''])(
    'keeps the current id without a report when the id is %j',
    (id) => {
      const onRejected = vi.fn();
      configureCorrelation({ onRejected });

      const stored = runWithCorrelationId('outer', () =>
        runWithCorrelationId(id as never, getCorrelationId),
      );

      expect(stored).toBe('outer');
      expect(onRejected).not.toHaveBeenCalled();
    },
  );

  it('rejects an id when the rule throws', () => {
    const onRejected = vi.fn();
    configureCorrelation({
      validateIncoming: () => {
        throw new Error('rule failed');
      },
      onRejected,
    });

    expect(runWithCorrelationId('edge-1', getCorrelationId)).toMatch(UUID);
    expect(onRejected).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'rule' }),
    );
  });

  it('runs the work when onRejected throws', () => {
    configureCorrelation({
      onRejected: () => {
        throw new Error('logger down');
      },
    });

    expect(runWithCorrelationId('a b', getCorrelationId)).toMatch(UUID);
  });

  it('restores the state before the first call when called without a policy', () => {
    const onRejected = vi.fn();
    configureCorrelation({ validateIncoming: () => false, onRejected });
    configureCorrelation();

    expect(runWithCorrelationId('a b', getCorrelationId)).toBe('a b');
    expect(correlationSource.accepts('a b')).toBe(false);
    expect(runWithCorrelationId('a\nb', getCorrelationId)).toMatch(UUID);
    expect(onRejected).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'throws when maxLength is %s',
    (maxLength) => {
      expect(() => configureCorrelation({ maxLength })).toThrow(
        /positive safe integer/,
      );
    },
  );
});

describe('httpCorrelation with configured rules', () => {
  it('lets its own options replace the rules for that middleware', () => {
    const onRejected = vi.fn();
    configureCorrelation({
      validateIncoming: (id) => id.startsWith('edge-'),
      onRejected,
    });
    const middleware = httpCorrelation({
      validateIncoming: () => true,
      maxLength: 4,
    });

    expect(viaHttp(middleware, 'core').id).toBe('core');
    expect(viaHttp(middleware, 'core-1').id).toMatch(UUID);
    expect(viaHttp(middleware, 'cé').id).toMatch(UUID);
    expect(onRejected.mock.calls.map(([rejection]) => rejection)).toEqual([
      { reason: 'too-long', source: 'http', length: 6 },
      { reason: 'invalid-character', source: 'http', length: 2 },
    ]);
  });

  it('reads rules configured after the middleware is built', () => {
    const middleware = httpCorrelation();
    configureCorrelation({ validateIncoming: () => true });

    expect(viaHttp(middleware, 'a b').id).toBe('a b');
  });

  it('runs the request with the id it generates, even when the rule rejects that id', () => {
    const onRejected = vi.fn();
    configureCorrelation({
      validateIncoming: (id) => id.startsWith('edge-'),
      onRejected,
    });

    const { id, responseId } = viaHttp(httpCorrelation());

    expect(id).toMatch(UUID);
    expect(responseId).toBe(id);
    expect(onRejected).not.toHaveBeenCalled();
  });
});
