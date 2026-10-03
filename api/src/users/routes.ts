/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Cqrs } from '@cqrs-ddd/cqrs';
import { UnauthorizedActionException } from '@cqrs-ddd/pipeline-casl';
import { z } from 'zod';
import { HEADERS } from '../common/constants/headers.constants.js';
import { EmailSchema } from '../common/validation/email.schema.js';
import { HttpError } from '../http/http-error.js';
import { type Route, route } from '../http/route.js';
import { CreateUserCommand } from './application/cqrs/commands/create-user.command.js';
import { DeleteUserCommand } from './application/cqrs/commands/delete-user.command.js';
import {
  EMPTY_USER_UPDATE_MESSAGE,
  UpdateUserCommand,
} from './application/cqrs/commands/update-user.command.js';
import { GetUserQuery } from './application/cqrs/queries/get-user.query.js';
import type { UserOverviewDto } from './application/cqrs/queries/get-user-overview.handler.js';
import { GetUserOverviewQuery } from './application/cqrs/queries/get-user-overview.query.js';
import { GetUsersQuery } from './application/cqrs/queries/get-users.query.js';
import type { UserReadModel } from './application/user-read-model.js';
import { User } from './domain/models/user.entity.js';

const UserId = z.object({ id: z.uuid() });

const NewUser = z.object({
  email: EmailSchema,
  name: z
    .string()
    .trim()
    .min(User.rules.username.minLength)
    .max(User.rules.username.maxLength),
  department: z
    .string()
    .trim()
    .min(User.rules.department.minLength)
    .max(User.rules.department.maxLength)
    .optional(),
});

const UserBody = z.object({
  id: z.string().optional(),
  email: z.string().optional(),
  name: z.string().optional(),
  department: z.string().nullable().optional(),
});

const OverviewBody = z.object({
  id: z.string().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  department: z.string().nullable().optional(),
  roles: z.array(z.string().nullable()).optional(),
  capabilities: z.array(z.string().nullable()).optional(),
});

const { username, department } = UpdateUserCommand.schema.shape;

const UserChanges = z
  .object({ name: username, department })
  .refine(
    (value) => value.name !== undefined || value.department !== undefined,
    { message: EMPTY_USER_UPDATE_MESSAGE },
  );

/**
 * The answer body of a user: its `username` named `name`, and only the fields the
 * caller may read.
 *
 * @example
 * ```ts
 * userBody({ id, username: 'ann' }); // { id, name: 'ann' }
 * ```
 */
export function userBody(user: UserReadModel) {
  return {
    ...(user.id !== undefined ? { id: user.id } : {}),
    ...(user.email !== undefined ? { email: user.email } : {}),
    ...(user.username !== undefined ? { name: user.username } : {}),
    ...(user.department !== undefined
      ? { department: user.department ?? null }
      : {}),
  };
}

/**
 * The `/users` routes: list, read, overview, create, update and delete, each one command
 * or query on the buses. A write answers with the user as far as the caller may read it
 * afterwards.
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

  const readAfterWrite = async (userId: string) => {
    try {
      const user = await find(userId);
      return user ? userBody(user) : {};
    } catch (error) {
      if (error instanceof UnauthorizedActionException) return {};
      throw error;
    }
  };

  return [
    route({
      method: 'GET',
      path: '/users',
      summary: 'The users the caller may read.',
      response: z.object({ users: z.array(UserBody) }),
      handle: async () => {
        const users = await queryBus.execute<GetUsersQuery, UserReadModel[]>(
          new GetUsersQuery({}),
        );
        return { users: users.map(userBody) };
      },
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
        return userBody(user);
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
          UserOverviewDto | null
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
            username: body.name,
            email: body.email,
            ...(body.department !== undefined
              ? { department: body.department }
              : {}),
            ...(typeof idempotencyKey === 'string' ? { idempotencyKey } : {}),
          }),
        );
        return readAfterWrite(id);
      },
    }),
    route({
      method: 'PATCH',
      path: '/users/:id',
      params: UserId,
      body: UserChanges,
      summary: 'Updates a user; answers it as far as the caller may read it.',
      response: UserBody,
      handle: async ({ params, body }) => {
        await commandBus.execute(
          new UpdateUserCommand({
            id: params.id,
            ...(body.name !== undefined ? { username: body.name } : {}),
            ...(body.department !== undefined
              ? { department: body.department }
              : {}),
          }),
        );
        return readAfterWrite(params.id);
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
