/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IQueryRepository } from '@cqrs-ddd/core/application';
import { MikroOrmStore } from '../../persistence/mikro-orm.store.js';
import { GetRolesQuery } from '../application/cqrs/queries/get-roles.query.js';
import { Role } from '../domain/models/role.entity.js';

export class GetRolesQueryRepository
  implements IQueryRepository<GetRolesQuery, Role[]>
{
  constructor(private readonly store: MikroOrmStore) {}

  async find(query: GetRolesQuery): Promise<Role[]> {
    const where =
      query.names !== undefined ? { name: { $in: query.names } } : {};
    return await this.store.em.find(Role, where);
  }
}
