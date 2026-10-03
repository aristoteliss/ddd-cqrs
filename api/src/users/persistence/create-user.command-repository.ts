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
import { UniqueEmailException } from '../domain/models/errors/email.exception.js';
import { User, UserSnapshot } from '../domain/models/user.entity.js';

export class CreateUserCommandRepository extends CommandRepository<
  User,
  UserSnapshot
> {
  constructor(
    protected readonly cache: ICache<UserSnapshot>,
    private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  /**
   * Persists a new user, caches the canonical id lookup and invalidates the
   * secondary email lookup so a previous negative/stale cache entry cannot hide
   * the newly-created aggregate.
   */
  @PersistedWrite<User>({
    cache: {
      logger: cacheWriteLogger,
      setKey: (user) => cacheKey(User.aggregateName, { id: user.id }),
      invalidateKeys: (user) => [
        cacheKey(User.aggregateName, { email: user.email }),
      ],
    },
    unique: { email: (user) => new UniqueEmailException(user) },
  })
  async save(user: User): Promise<UserSnapshot> {
    const em = this.store.em;
    assertAutocommit(em, 'createUser');
    const persistedUser = em.create(User, user);
    em.persist(persistedUser);
    await em.flush();
    return persistedUser.toJSON();
  }
}
