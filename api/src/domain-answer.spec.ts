/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Server } from 'node:http';
import { RateLimitExceededError } from '@cqrs-ddd/pipeline-rate-limit';
import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import type { Express } from 'express';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { domainAnswer } from './domain-answer.js';
import { requestContext } from './http/context.js';
import { expressApp } from './http/express.js';
import { fastifyApp } from './http/fastify.js';
import { route } from './http/route.js';

function validationError(): ZodValidationError {
  const result = z.object({ name: z.string() }).safeParse({});
  if (result.success) throw new Error('Expected parse to fail');
  return new ZodValidationError(result.error);
}

const logger = pino({ level: 'silent' });
const options = {
  routes: [
    route({
      method: 'GET',
      path: '/limited',
      handle: async () => {
        throw new RateLimitExceededError({
          key: 'probe',
          requestName: 'ProbeCommand',
          msBeforeNext: 2500,
          remainingPoints: 0,
          limit: 1,
        });
      },
    }),
    route({
      method: 'GET',
      path: '/middleware',
      handle: async () => 'unreachable',
    }),
  ],
  context: requestContext(logger, [
    (req, _res, next) =>
      req.url?.startsWith('/middleware') ? next(validationError()) : next(),
  ]),
  logger,
  domain: domainAnswer,
};

describe.each(['express', 'fastify'] as const)(
  'Package error answers on %s',
  (adapter) => {
    let server: Express | Server;
    let close: () => Promise<unknown> = async () => undefined;

    beforeAll(async () => {
      if (adapter === 'fastify') {
        const fastify = await fastifyApp(options);
        await fastify.ready();
        server = fastify.server;
        close = () => fastify.close();
      } else {
        server = expressApp(options);
      }
    });

    afterAll(() => close());

    it('answers a package error thrown in the request context', async () => {
      const response = await request(server).get('/middleware');

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        details: { fieldErrors: { name: expect.any(Array) } },
      });
    });

    it('sets Retry-After in whole seconds on a rate-limited answer', async () => {
      const response = await request(server).get('/limited');

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBe('3');
      expect(response.body).toMatchObject({ statusCode: 429, retryAfter: 3 });
    });
  },
);
