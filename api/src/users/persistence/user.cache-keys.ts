/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { cacheKey } from '@cqrs-ddd/core/persistence';
import { User } from '../domain/models/user.entity.js';

/** The repository cache keys under which a user is stored or looked up. */
export const userCacheKeys = {
  byId: (user: Pick<User, 'id'>) =>
    cacheKey(User.aggregateName, { id: user.id }),
  byEmail: (user: Pick<User, 'email'>) =>
    cacheKey(User.aggregateName, { email: user.email }),
  all: (user: Pick<User, 'id' | 'email'>) => [
    userCacheKeys.byId(user),
    userCacheKeys.byEmail(user),
  ],
};
