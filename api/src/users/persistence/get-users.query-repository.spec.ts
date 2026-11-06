/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { describe, expect, it, vi } from 'vitest';
import { GetUsersQuery } from '../application/cqrs/queries/get-users.query.js';
import { User } from '../domain/models/user.entity.js';
import { GetUsersQueryRepository } from './get-users.query-repository.js';

describe('GetUsersQueryRepository', () => {
  it('returns every persisted user from the entity manager', async () => {
    const users = [
      User.create('Alice', 'alice@example.test', 'engineering'),
      User.create('Bob', 'bob@example.test', 'support'),
    ];
    const findAll = vi.fn().mockResolvedValue(users);
    const repository = new GetUsersQueryRepository({
      em: { findAll },
    } as never);

    const result = await repository.find(new GetUsersQuery({}));

    expect(result).toBe(users);
    expect(findAll).toHaveBeenCalledWith(User);
  });
});
