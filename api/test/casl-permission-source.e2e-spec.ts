/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { UnauthorizedActionException } from '@cqrs-ddd/pipeline-casl';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ADAPTERS,
  bootstrapE2E,
  type E2EContext,
  inTenant,
  rebuildPermissions,
} from './support/e2e-app.js';

const TENANT = 'tenant';
const ALICE_ADMIN = '019de10c-b680-7000-8000-000000000006';
const ADMIN_ROLE = '019de10c-b680-7000-8000-000000000001';
const USER_READ_CAPABILITY = '019de10c-b680-7000-8000-00000000000f';
const ADMIN = JSON.stringify({ id: 'seed', grants: ['all|manage|*'] });

/**
 * Boots the real application and dispatches a gated query through its query bus,
 * so the CASL behavior, its permission source and the store work together on
 * seeded rows.
 */
describe.each(ADAPTERS)(
  'CASL permission source wiring (e2e) on %s',
  (adapter) => {
    let ctx: E2EContext;
    let unassignedUserId: string;

    const http = () => request(ctx.server);

    async function createUser(name: string): Promise<string> {
      const created = await http()
        .post('/users')
        .set('x-tenant-schema', TENANT)
        .set('x-test-user', ADMIN)
        .send({ email: `${name}-${Date.now()}@acme.test`, name });
      expect(created.status).toBe(201);
      return created.body.id;
    }

    async function sql(statement: string, params: unknown[]): Promise<void> {
      await inTenant(ctx.app, () =>
        ctx.storage.store.em.execute(statement, params),
      );
    }

    const assign = (userId: string, roleId: string) =>
      sql('insert into user_roles (user_id, role_id) values (?, ?)', [
        userId,
        roleId,
      ]);

    beforeAll(async () => {
      ctx = await bootstrapE2E({ adapter });
      unassignedUserId = await createUser('unassigned');
    });

    afterAll(async () => {
      await ctx?.close();
    });

    async function readAs(principalId: string): Promise<unknown> {
      const { sessionPrincipalStore } = await import(
        '../src/common/context/session-principal.store.js'
      );
      const { GetUserQuery } = await import(
        '../src/users/application/cqrs/queries/get-user.query.js'
      );
      return ctx.app.tenants.run(TENANT, () =>
        sessionPrincipalStore.run(
          { id: principalId, type: 'user', tenant: TENANT },
          () =>
            ctx.app.cqrs.queryBus.execute(
              new GetUserQuery({ userId: ALICE_ADMIN }),
            ),
        ),
      );
    }

    it('authorizes from materialized rules without per-request assignment or role queries', async () => {
      const { GetUserCapabilitiesQueryRepository } = await import(
        '../src/users/persistence/get-user-capabilities.query-repository.js'
      );
      const { GetRolesCapabilitiesQueryRepository } = await import(
        './support/roles-capabilities/get-roles-capabilities.query-repository.js'
      );
      const assignments = vi.spyOn(
        GetUserCapabilitiesQueryRepository.prototype,
        'find',
      );
      const roleFind = vi.spyOn(
        GetRolesCapabilitiesQueryRepository.prototype,
        'find',
      );
      const roleGet = vi.spyOn(
        GetRolesCapabilitiesQueryRepository.prototype,
        'getRoles',
      );

      await expect(readAs(ALICE_ADMIN)).resolves.toMatchObject({
        id: ALICE_ADMIN,
        username: 'alice_tenant',
      });
      expect(assignments).not.toHaveBeenCalled();
      expect(roleFind).not.toHaveBeenCalled();
      expect(roleGet).not.toHaveBeenCalled();

      assignments.mockRestore();
      roleFind.mockRestore();
      roleGet.mockRestore();
    });

    it('denies the next dispatch after a rebuild removes the rule, without a new login', async () => {
      const holder = await createUser('rebuild-holder');
      await assign(holder, ADMIN_ROLE);
      await rebuildPermissions();
      await expect(readAs(holder)).resolves.toMatchObject({ id: ALICE_ADMIN });

      await sql('delete from user_roles where user_id = ?', [holder]);
      await rebuildPermissions();

      await expect(readAs(holder)).rejects.toBeInstanceOf(
        UnauthorizedActionException,
      );
    });

    it('drops a deleted role from its holder on the next dispatch', async () => {
      const holder = await createUser('role-holder');
      const role = await http()
        .post('/roles')
        .set('x-tenant-schema', TENANT)
        .set('x-test-user', ADMIN)
        .send({ name: `readers-${Date.now()}` });
      expect(role.status).toBe(201);
      await sql(
        'insert into role_capabilities (role_id, capability_id) values (?, ?)',
        [role.body.id, USER_READ_CAPABILITY],
      );
      await assign(holder, role.body.id);
      await rebuildPermissions();
      await expect(readAs(holder)).resolves.toMatchObject({ id: ALICE_ADMIN });

      const deleted = await http()
        .delete(`/roles/${role.body.id}`)
        .set('x-tenant-schema', TENANT)
        .set('x-test-user', ADMIN);
      expect(deleted.status).toBe(204);

      await expect(readAs(holder)).rejects.toBeInstanceOf(
        UnauthorizedActionException,
      );
    });

    it('denies a persisted principal without any assignment', async () => {
      await expect(readAs(unassignedUserId)).rejects.toBeInstanceOf(
        UnauthorizedActionException,
      );
    });

    it('dispatches GetUserPermissionRulesQuery through QueryBus with Casl authorization', async () => {
      const { GetUserPermissionRulesQuery } = await import(
        '../src/auths/application/cqrs/queries/get-user-permission-rules.query.js'
      );
      const { sessionPrincipalStore } = await import(
        '../src/common/context/session-principal.store.js'
      );

      const rules = await ctx.app.tenants.run(TENANT, () =>
        sessionPrincipalStore.run(
          { id: ALICE_ADMIN, type: 'user', tenant: TENANT },
          () =>
            ctx.app.cqrs.queryBus.execute<object, unknown[]>(
              new GetUserPermissionRulesQuery({ userId: ALICE_ADMIN }),
            ),
        ),
      );

      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);

      await expect(
        ctx.app.tenants.run(TENANT, () =>
          sessionPrincipalStore.run(
            { id: unassignedUserId, type: 'user', tenant: TENANT },
            () =>
              ctx.app.cqrs.queryBus.execute(
                new GetUserPermissionRulesQuery({ userId: ALICE_ADMIN }),
              ),
          ),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedActionException);
    });
  },
);
