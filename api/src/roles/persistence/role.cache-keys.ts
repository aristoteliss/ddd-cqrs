/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { cacheKey } from '@cqrs-ddd/core/persistence';
import { Role } from '../domain/models/role.entity.js';

/** The repository cache keys under which a role is stored or looked up. */
export const roleCacheKeys = {
  byId: (role: Pick<Role, 'id'>) =>
    cacheKey(Role.aggregateName, { id: role.id }),
  byName: (role: Pick<Role, 'name'>) =>
    cacheKey(Role.aggregateName, { name: role.name }),
  all: (role: Pick<Role, 'id' | 'name'>) => [
    roleCacheKeys.byId(role),
    roleCacheKeys.byName(role),
  ],
};
