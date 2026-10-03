/* Copyright (C) 2026-present Aristotelis — see repository license. */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADAPTERS, bootstrapE2E, type E2EContext } from './support/e2e-app.js';

describe.each(ADAPTERS)(
  'aggregate construction boundary (e2e) on %s',
  (adapter) => {
    let ctx: E2EContext;
    let http: E2EContext['server'];

    const admin = JSON.stringify({
      id: 'admin-aggregate-construction',
      email: 'admin@aggregate.test',
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

    it('creates through the application factory path and rehydrates the persisted aggregate', async () => {
      const email = `factory-${Date.now()}@acme.test`;

      const created = await request(http)
        .post('/users')
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', admin)
        .send({
          email,
          name: 'Factory Fiona',
          department: 'Engineering',
        });

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        email,
        name: 'Factory Fiona',
        department: 'Engineering',
      });

      const rehydrated = await request(http)
        .get(`/users/${created.body.id}`)
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', admin);

      expect(rehydrated.status).toBe(200);
      expect(rehydrated.body).toMatchObject({
        id: created.body.id,
        email,
        name: 'Factory Fiona',
        department: 'Engineering',
      });
    });
  },
);
