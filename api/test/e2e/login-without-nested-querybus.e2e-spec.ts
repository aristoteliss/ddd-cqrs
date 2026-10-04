/* Copyright (C) 2026-present Aristotelis — see repository license. */

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ADAPTERS,
  bootstrapE2E,
  E2E_LOGIN_CODE,
  type E2EContext,
} from '../support/e2e-app.js';

describe.each(ADAPTERS)(
  'login command does not dispatch nested queries (e2e) on %s',
  (adapter) => {
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
      await new Promise((resolve) => setTimeout(resolve, 300));
      await ctx?.close();
    });

    it('logs in without QueryBus.execute()', async () => {
      const email = `no-nested-querybus-${Date.now()}@acme.test`;
      const created = await request(http)
        .post('/users')
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', admin)
        .send({ email, name: 'Boundary User', department: 'engineering' });
      expect(created.status).toBe(201);

      const queryBus = ctx.app.cqrs.queryBus;
      const executeSpy = vi.spyOn(queryBus, 'execute');

      const login = await request(http)
        .post('/auths/login')
        .set('x-tenant-schema', 'tenant')
        .send({ email, code: E2E_LOGIN_CODE });

      expect(login.status).toBe(200);
      expect(login.body.id).toBe(created.body.id);
      expect(login.body).not.toHaveProperty('capabilities');
      expect(executeSpy).not.toHaveBeenCalled();

      executeSpy.mockRestore();
    });
  },
);
