/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { cacheKey } from '@cqrs-ddd/core/persistence';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  User,
  type UserSnapshot,
} from '../../src/users/domain/models/user.entity.js';
import { bootstrapE2E, type E2EContext, inTenant } from '../support/e2e-app.js';

describe('create-user secondary cache invalidation (e2e)', () => {
  let ctx: E2EContext;
  let http: E2EContext['server'];
  const admin = JSON.stringify({
    id: 'admin-cache',
    email: 'admin@acme.test',
    department: 'platform',
    grants: ['all|manage|*'],
  });

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    http = ctx.server;
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('removes a stale email cache entry after creating that email', () =>
    inTenant(ctx.app, async () => {
      const email = `cache-create-${Date.now()}@acme.test`;
      const key = cacheKey(User.aggregateName, { email }, 'tenant');
      const cache = ctx.storage.cache<UserSnapshot>();
      await cache.set(key, { username: 'stale', email });
      expect(await cache.get(key)).toBeDefined();

      const response = await request(http)
        .post('/users')
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', admin)
        .send({ email, name: 'Fresh User' });

      expect(response.status).toBe(201);
      // The write-through invalidation evicts the secondary key outright: the
      // versioned adapter fences concurrent fills by revision, so no sentinel is
      // left behind for a later read to hydrate.
      expect(await cache.get(key)).toBeUndefined();
    }));
});
