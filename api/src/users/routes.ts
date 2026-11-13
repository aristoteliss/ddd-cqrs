/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Cqrs } from '@cqrs-ddd/cqrs';
import { z } from 'zod';
import type { WriteResult } from '../common/authorization/readable.js';
import { HEADERS } from '../common/constants/headers.constants.js';
import { HttpError } from '../http/http-error.js';
import { readAfterWrite } from '../http/read-after-write.js';
import { type Route, route } from '../http/route.js';
import { CreateUserCommand } from './application/cqrs/commands/create-user.command.js';
import { DeleteUserCommand } from './application/cqrs/commands/delete-user.command.js';
import {
  UpdateUserCommand,
  UserChangesSchema,
} from './application/cqrs/commands/update-user.command.js';
import { GetUserQuery } from './application/cqrs/queries/get-user.query.js';
import { GetUserOverviewQuery } from './application/cqrs/queries/get-user-overview.query.js';
import { GetUsersQuery } from './application/cqrs/queries/get-users.query.js';
import type { UserOverviewReadModel } from './application/user-overview-read-model.js';
import type { UserReadModel } from './application/user-read-model.js';
import type { User } from './domain/models/user.entity.js';

const UserId = z.object({ id: z.uuid() });

const NewUser = CreateUserCommand.schema.omit({ idempotencyKey: true });

const UserBody = z.object({
  id: z.string().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  department: z.string().nullable().optional(),
});

const OverviewBody = UserBody.extend({
  roles: z.array(z.string().nullable()).optional(),
  capabilities: z.array(z.string().nullable()).optional(),
});

/**
 * The `/users` routes: list, read, overview, create, update and delete. A write answers
 * with the user as far as the caller may read it: an update from its command result, and
 * a create from a read after the write, because an idempotent replay must answer the
 * current user.
 *
 * @example
 * ```ts
 * expressApp({ routes: userRoutes(cqrs), context, logger });
 * ```
 */
export function userRoutes({
  commandBus,
  queryBus,
}: Pick<Cqrs, 'commandBus' | 'queryBus'>): Route[] {
  const find = (userId: string, hydrate?: boolean) =>
    queryBus.execute<GetUserQuery, UserReadModel | null>(
      new GetUserQuery({ userId }, { hydrate }),
    );

  return [
    route({
      method: 'GET',
      path: '/users',
      summary: 'The users the caller may read.',
      response: z.object({ users: z.array(UserBody) }),
      handle: async () => ({
        users: await queryBus.execute<GetUsersQuery, UserReadModel[]>(
          new GetUsersQuery({}),
        ),
      }),
    }),
    route({
      method: 'GET',
      path: '/users/:id',
      params: UserId,
      summary: 'The user, without the fields the caller may not read.',
      response: UserBody,
      handle: async ({ params }) => {
        const user = await find(params.id, true);
        if (!user) throw new HttpError(404, 'User not found');

        return user;
      },
    }),
    route({
      method: 'GET',
      path: '/users/:id/overview',
      params: UserId,
      summary: 'The user with the roles and capabilities the caller may read.',
      response: OverviewBody,
      handle: async ({ params }) => {
        const overview = await queryBus.execute<
          GetUserOverviewQuery,
          UserOverviewReadModel | null
        >(new GetUserOverviewQuery({ userId: params.id }));
        if (!overview) throw new HttpError(404, 'User not found');

        return overview;
      },
    }),
    route({
      method: 'POST',
      path: '/users',
      body: NewUser,
      summary: 'Creates a user; answers it as far as the caller may read it.',
      response: UserBody,
      handle: async ({ body, headers }) => {
        const idempotencyKey = headers[HEADERS.IDEMPOTENCY_KEY];

        const { id } = await commandBus.execute<CreateUserCommand, User>(
          new CreateUserCommand({
            ...body,
            ...(typeof idempotencyKey === 'string' ? { idempotencyKey } : {}),
          }),
        );

        return readAfterWrite(() => find(id));
      },
    }),
    route({
      method: 'PATCH',
      path: '/users/:id',
      params: UserId,
      body: UserChangesSchema,
      summary: 'Updates a user; answers it as far as the caller may read it.',
      response: UserBody,
      handle: async ({ params, body }) => {
        const { read } = await commandBus.execute<
          UpdateUserCommand,
          WriteResult<User, UserReadModel>
        >(new UpdateUserCommand({ id: params.id, ...body }));

        return read ?? {};
      },
    }),
    route({
      method: 'DELETE',
      path: '/users/:id',
      params: UserId,
      status: 204,
      summary: 'Deletes a user.',
      handle: async ({ params }) => {
        await commandBus.execute(new DeleteUserCommand({ id: params.id }));
      },
    }),
  ];
}
