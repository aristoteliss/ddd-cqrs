/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ICache } from '@cqrs-ddd/core/application';
import {
  Cache,
  cacheKey,
  MapPersistenceErrors,
} from '@cqrs-ddd/core/persistence';
import {
  AggregateRepository,
  mapPersistenceError,
  optimisticDelete,
} from '@cqrs-ddd/mikro-orm';
import { cacheWriteLogger } from '../../persistence/cache/cache-loggers.js';
import { MikroOrmStore } from '../../persistence/mikro-orm.store.js';
import { Role, RoleSnapshot } from '../domain/models/role.entity.js';

export class DeleteRoleCommandRepository extends AggregateRepository<
  RoleSnapshot,
  Role,
  null
> {
  constructor(cache: ICache<RoleSnapshot>, store: MikroOrmStore) {
    super(cache, store, Role, Role.aggregateName, Role.fromJSON);
  }

  @Cache<Role, null>({
    logger: cacheWriteLogger,
    deleteKeys: (role) => [
      cacheKey(Role.aggregateName, { id: role.id }),
      cacheKey(Role.aggregateName, { name: role.name }),
    ],
  })
  @MapPersistenceErrors<[Role], Role>({
    entity: ([role]) => role,
    otherwise: (error, role) =>
      mapPersistenceError(error, `deleting Role ${role.id}`),
  })
  async save(role: Role): Promise<null> {
    await optimisticDelete(this.store.em, Role, role, 'Role');
    return null;
  }
}
