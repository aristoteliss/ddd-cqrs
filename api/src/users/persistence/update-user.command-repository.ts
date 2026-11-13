/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ICache } from '@cqrs-ddd/core/application';
import { PersistedWrite } from '@cqrs-ddd/core/persistence';
import { AggregateRepository, optimisticUpdate } from '@cqrs-ddd/mikro-orm';
import { cacheWriteLogger } from '../../persistence/cache/cache-loggers.js';
import { MikroOrmStore } from '../../persistence/mikro-orm.store.js';
import { User, UserSnapshot } from '../domain/models/user.entity.js';
import { userCacheKeys } from './user.cache-keys.js';

export class UpdateUserCommandRepository extends AggregateRepository<
  UserSnapshot,
  User,
  UserSnapshot
> {
  constructor(cache: ICache<UserSnapshot>, store: MikroOrmStore) {
    super(cache, store, User, User.aggregateName, User.fromJSON);
  }

  @PersistedWrite<User>({
    cache: {
      logger: cacheWriteLogger,
      setKey: userCacheKeys.byId,
      invalidateKeys: (user) => [userCacheKeys.byEmail(user)],
    },
  })
  async save(user: User): Promise<UserSnapshot> {
    const snapshot = user.toJSON();

    await optimisticUpdate(
      this.store.em,
      User,
      user,
      {
        username: snapshot.username,
        department: snapshot.department ?? null,
        updatedAt: snapshot.updatedAt,
      },
      'User',
    );

    return snapshot;
  }
}
