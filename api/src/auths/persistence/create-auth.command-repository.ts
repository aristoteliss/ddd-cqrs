/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ICache } from '@cqrs-ddd/core/application';
import { CommandRepository, PersistedWrite } from '@cqrs-ddd/core/persistence';
import { MikroOrmStore } from '../../persistence/mikro-orm.store.js';
import { Auth, AuthSnapshot } from '../domain/models/auth.entity.js';

export class CreateAuthCommandRepository extends CommandRepository<
  Auth,
  AuthSnapshot
> {
  constructor(
    protected readonly cache: ICache<AuthSnapshot>,
    private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  @PersistedWrite<Auth>()
  async save(auth: Auth): Promise<AuthSnapshot> {
    await this.store.em.insert(Auth, auth);

    return auth.toJSON();
  }
}
