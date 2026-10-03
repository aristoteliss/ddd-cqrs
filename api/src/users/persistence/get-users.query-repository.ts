/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IQueryRepository } from '@cqrs-ddd/core/application';
import { MikroOrmStore } from '../../persistence/mikro-orm.store.js';
import { GetUsersQuery } from '../application/cqrs/queries/get-users.query.js';
import { User } from '../domain/models/user.entity.js';

export class GetUsersQueryRepository
  implements IQueryRepository<GetUsersQuery, User[]>
{
  constructor(private readonly store: MikroOrmStore) {}

  async find(_query: GetUsersQuery): Promise<User[]> {
    return this.store.em.findAll(User);
  }
}
