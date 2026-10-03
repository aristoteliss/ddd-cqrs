/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ICache } from '@cqrs-ddd/core/application';
import {
  cacheKey,
  FromCache,
  QueryRepository,
} from '@cqrs-ddd/core/persistence';
import { cacheReadLogger } from '../../persistence/cache/cache-loggers.js';
import { MikroOrmStore } from '../../persistence/mikro-orm.store.js';
import { GetRoleQuery } from '../application/cqrs/queries/get-role.query.js';
import { Role, RoleSnapshot } from '../domain/models/role.entity.js';

function buildConditions(query: GetRoleQuery): Record<string, unknown> {
  return { id: query.roleId };
}

export class GetRoleQueryRepository extends QueryRepository<
  GetRoleQuery,
  Role | null
> {
  constructor(
    protected readonly cache: ICache<RoleSnapshot>,
    private readonly store: MikroOrmStore,
  ) {
    super(cache, {
      hydrateFn: (cached) => Role.fromJSON(cached as RoleSnapshot),
    });
  }

  @FromCache<GetRoleQuery, Role | null>({
    logger: cacheReadLogger,
    keyFn: (q) => cacheKey(Role.aggregateName, buildConditions(q)),
  })
  async find(query: GetRoleQuery): Promise<Role | null> {
    return this.store.em.findOne(
      Role,
      buildConditions(query),
      query.refresh ? { refresh: true } : undefined,
    );
  }
}
