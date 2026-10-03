/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { createPipeline } from './create-pipeline.js';
import { logging } from './helpers/logging.intent.js';
import { type PinoLike, pinoLogger } from './logger.js';

function recording() {
  const records: [string, object, string?][] = [];
  const level = (name: string) => (fields: object, message?: string) =>
    void records.push(
      message === undefined ? [name, fields] : [name, fields, message],
    );
  const pino: PinoLike = {
    trace: level('trace'),
    debug: level('debug'),
    info: level('info'),
    warn: level('warn'),
    error: level('error'),
    fatal: level('fatal'),
  };
  return { records, pino };
}

describe('pinoLogger', () => {
  it('maps NestJS-shaped calls to structured pino records', () => {
    const { records, pino } = recording();
    const logger = pinoLogger(pino);

    logger.log('ready');
    logger.verbose('detail', 'CacheBehavior');
    logger.debug('key built', { key: 'k' }, 'CacheBehavior');
    logger.warn({ msg: 'slow', durationMs: 900 }, 'GetUserHandler');
    logger.error('failed', 'Error: failed\n    at x', 'AuditBehavior');
    logger.error(new Error('boom'));
    logger.fatal(42);

    expect(records).toEqual([
      ['info', {}, 'ready'],
      ['trace', { context: 'CacheBehavior' }, 'detail'],
      [
        'debug',
        { context: 'CacheBehavior', params: [{ key: 'k' }] },
        'key built',
      ],
      ['warn', { context: 'GetUserHandler', msg: 'slow', durationMs: 900 }],
      [
        'error',
        { context: 'AuditBehavior', stack: 'Error: failed\n    at x' },
        'failed',
      ],
      ['error', { err: new Error('boom') }, 'boom'],
      ['fatal', {}, '42'],
    ]);
  });

  it("carries LoggingBehavior's structured records as pino fields", async () => {
    const { records, pino } = recording();
    const pipeline = createPipeline({
      logger: pinoLogger(pino),
      globalBehaviors: {
        before: [logging({ logFormat: 'structured', metricLogLevel: 'log' })],
      },
    });
    await pipeline.wrap({ name: 'getPrice', kind: 'query' })(async () => 1)();

    expect(records).toContainEqual([
      'info',
      expect.objectContaining({
        context: 'getPrice',
        requestKind: 'query',
        requestName: 'getPrice',
        durationMs: expect.any(Number),
      }),
    ]);
  });
});
