/* Copyright (C) 2026-present Aristotelis — see repository license. */

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADAPTERS, bootstrapE2E, type E2EContext } from '../support/e2e-app.js';

describe.each(ADAPTERS)('user event dispatch ports (e2e) on %s', (adapter) => {
  let ctx: E2EContext;
  let http: E2EContext['server'];

  const admin = JSON.stringify({
    id: 'admin-1',
    email: 'admin@acme.test',
    department: 'platform',
    grants: ['all|manage|*'],
  });

  beforeAll(async () => {
    ctx = await bootstrapE2E({ adapter });
    http = ctx.server;
  });

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 300));
    await ctx?.close();
  });

  it('preserves create/update HTTP flows while event handlers depend only on ports', async () => {
    const email = `event-port-${Date.now()}@acme.test`;
    const created = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email, name: 'Event Port User', department: 'engineering' });
    expect(created.status).toBe(201);

    const updated = await request(http)
      .patch(`/users/${created.body.id}`)
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ name: 'Event Port User Updated' });
    expect(updated.status).toBe(200);
  });
});
