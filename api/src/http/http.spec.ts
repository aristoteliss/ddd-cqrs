/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import { getCorrelationId } from '@cqrs-ddd/pipeline-correlation';
import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { requestContext } from './context.js';
import { expressApp } from './express.js';
import { fastifyApp } from './fastify.js';
import { route } from './route.js';

const logger = pino({ level: 'silent' });

const routes = [
  route({
    method: 'GET',
    path: '/things/:id',
    params: z.object({ id: z.uuid() }),
    query: z.object({ hydrate: z.coerce.boolean().optional() }),
    handle: async ({ params, query }) => ({
      id: params.id,
      hydrate: query.hydrate ?? false,
      correlationId: getCorrelationId(),
    }),
  }),
  route({
    method: 'POST',
    path: '/things',
    body: z.object({ name: z.string().min(3) }),
    handle: async ({ body, headers, cookies }) => ({
      name: body.name,
      key: headers['idempotency-key'],
      cookie: cookies.theme,
    }),
  }),
  route({
    method: 'DELETE',
    path: '/things/:id',
    status: 204,
    handle: async () => undefined,
  }),
  route({
    method: 'GET',
    path: '/missing',
    handle: async () => {
      throw new EntityNotFoundException('Thing', 't-1');
    },
  }),
  route({
    method: 'GET',
    path: '/invalid',
    handle: async () => {
      const { error } = z.object({ name: z.string() }).safeParse({});
      throw new ZodValidationError(error as z.ZodError);
    },
  }),
  route({
    method: 'GET',
    path: '/broken',
    handle: async () => {
      throw new Error('database down');
    },
  }),
];

const options = { routes, context: requestContext(logger), logger };
const fastify = await fastifyApp(options);

beforeAll(() => fastify.ready());
afterAll(() => fastify.close());

describe.each([
  ['Express', () => expressApp(options)],
  ['Fastify', () => fastify.server],
])('the routes on %s', (_name, server) => {
  const id = '01999a7e-6b5e-7cc4-9a43-3e1f6c2b9d10';

  it('parses params and query, and runs the route in the request correlation id', async () => {
    const res = await request(server())
      .get(`/things/${id}?hydrate=true`)
      .set('x-correlation-id', 'c-123');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id, hydrate: true, correlationId: 'c-123' });
    expect(res.headers['x-correlation-id']).toBe('c-123');
  });

  it('answers 201 to a POST with the parsed body, headers and cookies', async () => {
    const res = await request(server())
      .post('/things')
      .set('idempotency-key', 'op-1')
      .set('cookie', 'theme=dark')
      .send({ name: 'lamp' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'lamp', key: 'op-1' });
  });

  it('answers 400 with formErrors and fieldErrors when a schema rejects the input', async () => {
    const res = await request(server()).get('/things/not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      formErrors: [expect.any(String)],
      fieldErrors: {},
    });
  });

  it('answers the status a route declares, with no body', async () => {
    const res = await request(server()).delete(`/things/${id}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });

  it('maps domain, validation and unknown errors', async () => {
    const missing = await request(server()).get('/missing');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Thing not found',
    });

    const invalid = await request(server()).get('/invalid');
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      details: { fieldErrors: { name: [expect.any(String)] } },
    });

    const broken = await request(server()).get('/broken');
    expect(broken.status).toBe(500);
    expect(broken.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  it('answers 404 for an unknown route and 400 for malformed JSON', async () => {
    const unknown = await request(server()).get('/nope?x=1');
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({
      message: 'Cannot GET /nope?x=1',
      error: 'Not Found',
      statusCode: 404,
    });

    const malformed = await request(server())
      .post('/things')
      .set('content-type', 'application/json')
      .send('{"name":');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
    });
  });
});
