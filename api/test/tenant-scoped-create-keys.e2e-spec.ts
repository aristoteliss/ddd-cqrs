/* Copyright (C) 2026-present Aristotelis — see repository license. */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADAPTERS, bootstrapE2E, type E2EContext } from './support/e2e-app.js';

describe.each(ADAPTERS)('tenant-scoped create keys (e2e) on %s', (adapter) => {
  let ctx: E2EContext;
  let http: E2EContext['server'];

  const admin = JSON.stringify({
    id: 'same-admin',
    email: 'same-admin@acme.test',
    department: 'platform',
    grants: ['all|manage|*'],
  });

  beforeAll(async () => {
    ctx = await bootstrapE2E({ adapter, tenants: ['tenant_a', 'tenant_b'] });
    http = ctx.server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('allows the same principal and email to create independently in two tenants', async () => {
    const email = `cross-tenant-${Date.now()}@acme.test`;
    const create = (tenant: string) =>
      request(http)
        .post('/users')
        .set('x-tenant-schema', tenant)
        .set('x-test-user', admin)
        .send({ email, name: 'Tenant Scoped User' });

    const tenantA = await create('tenant_a');
    const tenantB = await create('tenant_b');

    expect(tenantA.status).toBe(201);
    expect(tenantB.status).toBe(201);
    expect(tenantA.body.id).not.toBe(tenantB.body.id);
  });
});
