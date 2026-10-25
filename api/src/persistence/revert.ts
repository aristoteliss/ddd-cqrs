/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { MikroORM } from '@mikro-orm/core';
import { forEachTenantOrm } from './tenant-orms.js';

/**
 * Reverts up to `steps` migrations in every tenant, stopping early in a tenant
 * with nothing left, and returns how many were reverted in all.
 */
export async function revert(steps = 1): Promise<number> {
  let total = 0;

  const revertTenant = async (orm: MikroORM) => {
    for (let i = 0; i < steps; i += 1) {
      const count = (await orm.migrator.down()).length;
      if (count === 0) break;
      total += count;
    }
  };

  await forEachTenantOrm(revertTenant);

  return total;
}
