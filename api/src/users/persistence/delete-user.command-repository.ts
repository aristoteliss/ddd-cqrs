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
import { User, UserSnapshot } from '../domain/models/user.entity.js';

export class DeleteUserCommandRepository extends AggregateRepository<
  UserSnapshot,
  User,
  null
> {
  constructor(cache: ICache<UserSnapshot>, store: MikroOrmStore) {
    super(cache, store, User, User.aggregateName, User.fromJSON);
  }

  @Cache<User, null>({
    logger: cacheWriteLogger,
    deleteKeys: (user) => [
      cacheKey(User.aggregateName, { id: user.id }),
      cacheKey(User.aggregateName, { email: user.email }),
    ],
  })
  @MapPersistenceErrors<[User], User>({
    entity: ([user]) => user,
    otherwise: (error, user) =>
      mapPersistenceError(error, `deleting User ${user.id}`),
  })
  async save(user: User): Promise<null> {
    await optimisticDelete(this.store.em, User, user, 'User');
    return null;
  }
}
