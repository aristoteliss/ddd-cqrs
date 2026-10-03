/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import { SpanKind } from '@opentelemetry/api';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import type { Express } from 'express';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { requestContext } from '../src/http/context.js';
import type { Around } from '../src/http/dispatch.js';
import { expressApp } from '../src/http/express.js';
import { fastifyApp } from '../src/http/fastify.js';
import { HttpError } from '../src/http/http-error.js';
import { route } from '../src/http/route.js';

const exporter = new tracing.InMemorySpanExporter();
const sdk = new NodeSDK({
  resourceDetectors: [],
  spanProcessors: [new tracing.SimpleSpanProcessor(exporter)],
  instrumentations: [new HttpInstrumentation()],
});

const serverSpans = () =>
  exporter.getFinishedSpans().filter((span) => span.kind === SpanKind.SERVER);

beforeAll(() => {
  sdk.start();
  // The instrumentation patches `http` on its next `require`; the test runner
  // and the frameworks loaded it before the SDK started.
  createRequire(import.meta.url)('node:http');
});

afterAll(() => sdk.shutdown());

const logger = pino({ level: 'silent' });
const options = {
  routes: [
    route({
      method: 'GET',
      path: '/probes/:id',
      params: z.object({ id: z.string() }),
      handle: async ({ params }) => ({ id: params.id }),
    }),
  ],
  context: requestContext(logger),
  logger,
  around: (async (request, work) => {
    if (request.headers.authorization === 'Bearer bad') {
      throw new HttpError(401, 'Invalid or expired token');
    }
    return work();
  }) satisfies Around,
};

describe.each(['express', 'fastify'] as const)(
  'HTTP server spans on %s',
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

    beforeEach(() => {
      exporter.reset();
    });

    it('names a matched route by its template and sets http.route', async () => {
      await request(server).get('/probes/42').expect(200);

      const [span] = serverSpans();
      expect(span?.name).toBe('GET /probes/:id');
      expect(span?.attributes['http.route']).toBe('/probes/:id');
    });

    it('names a matched route also when authentication refuses the request', async () => {
      await request(server)
        .get('/probes/42')
        .set('authorization', 'Bearer bad')
        .expect(401);

      const [span] = serverSpans();
      expect(span?.attributes['http.route']).toBe('/probes/:id');
    });

    it('keeps the method alone for an unknown path', async () => {
      await request(server).get('/nowhere').expect(404);

      const [span] = serverSpans();
      expect(span?.name).toBe('GET');
      expect(span?.attributes['http.route']).toBeUndefined();
    });
  },
);
