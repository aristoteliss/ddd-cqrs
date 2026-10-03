/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Cqrs } from '@cqrs-ddd/cqrs';
import { UnauthorizedActionException } from '@cqrs-ddd/pipeline-casl';
import { z } from 'zod';
import { HEADERS } from '../common/constants/headers.constants.js';
import { HttpError } from '../http/http-error.js';
import { type Route, route } from '../http/route.js';
import { CreateRoleCommand } from './application/cqrs/commands/create-role.command.js';
import { DeleteRoleCommand } from './application/cqrs/commands/delete-role.command.js';
import { UpdateRoleCommand } from './application/cqrs/commands/update-role.command.js';
import { GetRoleQuery } from './application/cqrs/queries/get-role.query.js';
import { GetRolesQuery } from './application/cqrs/queries/get-roles.query.js';
import type { RoleReadModel } from './application/role-read-model.js';
import { Role } from './domain/models/role.entity.js';

const RoleId = z.object({ id: z.uuid() });

const RoleBody = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
});

const RoleName = z.object({
  name: z
    .string()
    .trim()
    .min(Role.rules.name.minLength)
    .max(Role.rules.name.maxLength),
});

/**
 * The `/roles` routes: list, read, create, rename and delete, each one command or query
 * on the buses. A write answers with the role as far as the caller may read it
 * afterwards.
 *
 * @example
 * ```ts
 * expressApp({ routes: roleRoutes(cqrs), context, logger });
 * ```
 */
export function roleRoutes({
  commandBus,
  queryBus,
}: Pick<Cqrs, 'commandBus' | 'queryBus'>): Route[] {
  const find = (roleId: string, hydrate?: boolean) =>
    queryBus.execute<GetRoleQuery, RoleReadModel | null>(
      new GetRoleQuery({ roleId }, { hydrate }),
    );

  const readAfterWrite = async (roleId: string) => {
    try {
      return (await find(roleId)) ?? {};
    } catch (error) {
      if (error instanceof UnauthorizedActionException) return {};
      throw error;
    }
  };

  return [
    route({
      method: 'GET',
      path: '/roles',
      summary: 'The roles the caller may read.',
      response: z.object({ roles: z.array(RoleBody) }),
      handle: async () => ({
        roles: await queryBus.execute<GetRolesQuery, RoleReadModel[]>(
          new GetRolesQuery({}),
        ),
      }),
    }),
    route({
      method: 'GET',
      path: '/roles/:id',
      params: RoleId,
      summary: 'The role, without the fields the caller may not read.',
      response: RoleBody,
      handle: async ({ params }) => {
        const role = await find(params.id, false);
        if (!role) throw new HttpError(404, 'Role not found');
        return role;
      },
    }),
    route({
      method: 'POST',
      path: '/roles',
      body: RoleName,
      summary: 'Creates a role; answers it as far as the caller may read it.',
      response: RoleBody,
      handle: async ({ body, headers }) => {
        const idempotencyKey = headers[HEADERS.IDEMPOTENCY_KEY];
        const { id } = await commandBus.execute<CreateRoleCommand, Role>(
          new CreateRoleCommand({
            name: body.name,
            ...(typeof idempotencyKey === 'string' ? { idempotencyKey } : {}),
          }),
        );
        return readAfterWrite(id);
      },
    }),
    route({
      method: 'PATCH',
      path: '/roles/:id',
      params: RoleId,
      body: RoleName,
      summary: 'Renames a role; answers it as far as the caller may read it.',
      response: RoleBody,
      handle: async ({ params, body }) => {
        await commandBus.execute(
          new UpdateRoleCommand({ id: params.id, name: body.name }),
        );
        return readAfterWrite(params.id);
      },
    }),
    route({
      method: 'DELETE',
      path: '/roles/:id',
      params: RoleId,
      status: 204,
      summary: 'Deletes a role.',
      handle: async ({ params }) => {
        await commandBus.execute(new DeleteRoleCommand({ id: params.id }));
      },
    }),
  ];
}
