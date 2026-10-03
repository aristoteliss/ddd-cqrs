/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ICache } from '@cqrs-ddd/core/application';
import {
  CommandRepository,
  cacheKey,
  PersistedWrite,
} from '@cqrs-ddd/core/persistence';
import { assertAutocommit } from '@cqrs-ddd/mikro-orm';
import { cacheWriteLogger } from '../../persistence/cache/cache-loggers.js';
import { MikroOrmStore } from '../../persistence/mikro-orm.store.js';
import { UniqueRoleNameException } from '../domain/models/errors/role-name.exception.js';
import { Role, RoleSnapshot } from '../domain/models/role.entity.js';

export class CreateRoleCommandRepository extends CommandRepository<
  Role,
  RoleSnapshot
> {
  constructor(
    protected readonly cache: ICache<RoleSnapshot>,
    private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  @PersistedWrite<Role>({
    cache: {
      logger: cacheWriteLogger,
      setKey: (role) => cacheKey(Role.aggregateName, { id: role.id }),
      invalidateKeys: (role) => [
        cacheKey(Role.aggregateName, { name: role.name }),
      ],
    },
    unique: { name: (role) => new UniqueRoleNameException(role) },
  })
  async save(role: Role): Promise<RoleSnapshot> {
    const em = this.store.em;
    assertAutocommit(em, 'createRole');
    const persisted = await em.upsert(Role, role);
    return persisted.toJSON();
  }
}
