/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADAPTERS, bootstrapE2E, type E2EContext } from './support/e2e-app.js';

describe.each(ADAPTERS)(
  'tenant EntityManager metadata (e2e) on %s',
  (adapter) => {
    let ctx: E2EContext;

    beforeAll(async () => {
      ctx = await bootstrapE2E({ adapter, tenants: ['tenant_a', 'tenant_b'] });
    });

    afterAll(async () => {
      await ctx?.close();
    });

    it('selects isolated tenant managers without monkey-patching MikroORM objects', async () => {
      const store = ctx.storage.store;
      const tenantContext = ctx.app.tenants;

      const managerA = await tenantContext.run(
        'tenant_a',
        async () => store.em,
      );
      const managerB = await tenantContext.run(
        'tenant_b',
        async () => store.em,
      );

      expect(managerA).not.toBe(managerB);
      expect(
        (managerA as unknown as Record<string, unknown>).__tenant,
      ).toBeUndefined();
      expect(
        (managerB as unknown as Record<string, unknown>).__tenant,
      ).toBeUndefined();
    });
  },
);
