/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { MikroORM } from '@mikro-orm/core';
import { Auth } from '../auths/domain/models/auth.entity.js';
import { REFRESH_TOKEN_TTL_SECONDS } from '../common/environment/auth-token.config.js';
import { forEachTenantOrm } from './tenant-orms.js';

const BATCH_SIZE = 500;

/**
 * Deletes sessions that expired, or were revoked longer ago than the refresh
 * lifetime, in every tenant. Their rotated-token history goes with them (cascade).
 */
export async function purgeSessions(): Promise<Map<string, number>> {
  const now = Date.now();
  const revokedBefore = now - REFRESH_TOKEN_TTL_SECONDS * 1000;

  const purgeTenant = async (orm: MikroORM): Promise<number> => {
    let purged = 0;
    for (;;) {
      const em = orm.em.fork();
      const batch = await em.find(
        Auth,
        {
          $or: [
            { expiresAt: { $lte: now } },
            { revokedAt: { $ne: null, $lte: revokedBefore } },
          ],
        },
        {
          fields: ['id'],
          limit: BATCH_SIZE,
          disableIdentityMap: true,
        } as never,
      );
      if (batch.length === 0) return purged;
      purged += await em.nativeDelete(Auth, {
        id: { $in: batch.map((auth) => auth.id) },
      });
    }
  };

  return forEachTenantOrm(purgeTenant);
}
