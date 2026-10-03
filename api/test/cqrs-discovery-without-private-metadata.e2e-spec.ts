/* Copyright (C) 2026-present Aristotelis — see repository license. */

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADAPTERS, bootstrapE2E, type E2EContext } from './support/e2e-app.js';

describe.each(ADAPTERS)('CQRS handler registration (e2e) on %s', (adapter) => {
  let ctx: E2EContext;
  let http: E2EContext['server'];

  const admin = JSON.stringify({
    id: 'cqrs-discovery-admin',
    email: 'cqrs-discovery@acme.test',
    department: 'platform',
    grants: ['all|manage|*'],
  });

  beforeAll(async () => {
    ctx = await bootstrapE2E({ adapter });
    http = ctx.server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('dispatches a registered query handler through its pipeline', async () => {
    const response = await request(http)
      .get('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.users)).toBe(true);
  });
});
