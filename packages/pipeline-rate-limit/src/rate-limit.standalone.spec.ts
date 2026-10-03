/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createPipeline } from '@cqrs-ddd/pipeline';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { describe, expect, it } from 'vitest';
import { RateLimitExceededError } from './errors/rate-limit-exceeded.error.js';
import { rateLimit } from './helpers/rate-limit.intent.js';
import { toHttpResponse } from './http.js';
import { RateLimitBehavior } from './rate-limit.behavior.js';

describe('RateLimitBehavior on wrapped functions', () => {
  it('lets calls through within the limit and refuses the next one with a 429 answer', async () => {
    const pipeline = createPipeline({
      behaviors: [
        new RateLimitBehavior(
          new RateLimiterMemory({ points: 1, duration: 60 }),
        ),
      ],
    });
    const search = pipeline.wrap(
      { name: 'search', kind: 'query' },
      rateLimit({
        keyFactory: (context) => `${context.requestName}:anonymous`,
      }),
    )(async (term: string) => [term]);

    await expect(search('a')).resolves.toEqual(['a']);
    const error = await search('b').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitExceededError);
    const response = toHttpResponse(error as RateLimitExceededError);
    expect(response.status).toBe(429);
    expect(response.headers['Retry-After']).toBe(
      String((error as RateLimitExceededError).retryAfterSeconds),
    );
    expect(response.body).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
    });
  });

  it('cannot be built without a limiter', () => {
    expect(() => new RateLimitBehavior(undefined as never)).toThrow(
      'RateLimitBehavior requires a rate limiter',
    );
  });
});
