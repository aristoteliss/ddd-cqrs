/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { App } from '../app.js';
import { routes } from '../routes.js';
import { openApiDocument } from './openapi.js';
import { route } from './route.js';

const info = { title: 'probe', version: '1.0.0' };
const security = [{ bearer: [] }];

const table = [
  route({
    method: 'GET',
    path: '/things/:id',
    params: z.object({ id: z.uuid() }),
    query: z.object({ hydrate: z.boolean().optional() }),
    summary: 'A thing.',
    response: z.object({ id: z.string() }),
    handle: async () => undefined,
  }),
  route({
    method: 'POST',
    path: '/things',
    body: z.object({ name: z.string().min(3) }),
    anonymous: true,
    handle: async () => undefined,
  }),
  route({
    method: 'DELETE',
    path: '/things/:id',
    params: z.object({ id: z.uuid() }),
    status: 204,
    response: z.object({ never: z.string() }),
    handle: async () => undefined,
  }),
];

describe('openApiDocument', () => {
  const document = openApiDocument(table, {
    info,
    parameters: [{ in: 'header', name: 'x-tenant-schema', required: true }],
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
    security,
  });
  const get = document.paths['/things/{id}'].get as Record<string, never>;
  const post = document.paths['/things'].post as Record<string, never>;
  const remove = document.paths['/things/{id}'].delete as Record<string, never>;

  it('turns route templates into OpenAPI paths and parameters', () => {
    expect(get.summary).toBe('A thing.');
    expect(get.parameters).toEqual([
      { in: 'header', name: 'x-tenant-schema', required: true },
      expect.objectContaining({ name: 'id', in: 'path', required: true }),
      expect.objectContaining({
        name: 'hydrate',
        in: 'query',
        required: false,
      }),
    ]);
  });

  it('documents the body, the success status and the answer schema', () => {
    expect(post.requestBody).toEqual({
      required: true,
      content: {
        'application/json': {
          schema: expect.objectContaining({ required: ['name'] }),
        },
      },
    });
    expect(Object.keys(post.responses)).toEqual(['201']);
    expect(get.responses).toEqual({
      200: {
        description: 'OK',
        content: { 'application/json': { schema: expect.any(Object) } },
      },
    });
    expect(remove.responses).toEqual({ 204: { description: 'No Content' } });
  });

  it('lists the security on every route but an anonymous one', () => {
    expect(get.security).toEqual(security);
    expect(post).not.toHaveProperty('security');
    expect(document.components).toEqual({
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
    });
  });

  it('documents the 14 operations of the application', () => {
    const application = openApiDocument(
      routes({ cqrs: {}, logins: {} } as unknown as App),
      { info, security },
    );
    const operations = Object.entries(application.paths).flatMap(
      ([path, methods]) =>
        Object.entries(methods).map(([method, operation]) => [
          `${method.toUpperCase()} ${path}`,
          'security' in (operation as object),
        ]),
    );

    expect(operations).toHaveLength(14);
    expect(
      operations.filter(([, secured]) => !secured).map(([name]) => name),
    ).toEqual([
      'POST /auths/login',
      'POST /auths/refresh',
      'POST /auths/logout',
    ]);
  });
});
