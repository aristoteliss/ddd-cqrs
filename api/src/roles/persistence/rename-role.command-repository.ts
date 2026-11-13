/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ICache } from '@cqrs-ddd/core/application';
import { PersistedWrite } from '@cqrs-ddd/core/persistence';
import { AggregateRepository, optimisticUpdate } from '@cqrs-ddd/mikro-orm';
import { cacheWriteLogger } from '../../persistence/cache/cache-loggers.js';
import { MikroOrmStore } from '../../persistence/mikro-orm.store.js';
import { UniqueRoleNameException } from '../domain/models/errors/role-name.exception.js';
import { Role, RoleSnapshot } from '../domain/models/role.entity.js';
import { roleCacheKeys } from './role.cache-keys.js';

export class RenameRoleCommandRepository extends AggregateRepository<
  RoleSnapshot,
  Role,
  RoleSnapshot
> {
  constructor(cache: ICache<RoleSnapshot>, store: MikroOrmStore) {
    super(cache, store, Role, Role.aggregateName, Role.fromJSON);
  }

  @PersistedWrite<Role>({
    cache: {
      logger: cacheWriteLogger,
      setKey: roleCacheKeys.byId,
      invalidateKeys: (role) => [roleCacheKeys.byName(role)],
    },
    unique: { name: (role) => new UniqueRoleNameException(role) },
  })
  async save(role: Role): Promise<RoleSnapshot> {
    const snapshot = role.toJSON();

    await optimisticUpdate(
      this.store.em,
      Role,
      role,
      {
        name: snapshot.name,
        updatedAt: snapshot.updatedAt,
      },
      'Role',
    );

    return snapshot;
  }
}
