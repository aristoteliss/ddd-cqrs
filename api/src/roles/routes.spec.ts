/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { CaslAuthorizer } from '@cqrs-ddd/pipeline-casl';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { memoryCqrs, mountOptions } from '../../test/support/harness.js';
import { expressApp } from '../http/express.js';
import { fastifyApp } from '../http/fastify.js';
import { CreateRoleHandler } from './application/cqrs/commands/create-role.handler.js';
import { DeleteRoleHandler } from './application/cqrs/commands/delete-role.handler.js';
import { UpdateRoleHandler } from './application/cqrs/commands/update-role.handler.js';
import { GetRoleHandler } from './application/cqrs/queries/get-role.handler.js';
import type { GetRoleQuery } from './application/cqrs/queries/get-role.query.js';
import { GetRolesHandler } from './application/cqrs/queries/get-roles.handler.js';
import { RoleDeletedEvent } from './domain/events/role-deleted.event.js';
import { UniqueRoleNameException } from './domain/models/errors/role-name.exception.js';
import { Role, type RoleSnapshot } from './domain/models/role.entity.js';
import { roleRoutes } from './routes.js';

const ADMIN = ['Role|manage|*', 'User|read|*'];

class MemoryRoles {
  readonly rows = new Map<string, RoleSnapshot>();

  async save(role: Role): Promise<RoleSnapshot | null> {
    const deleted = role
      .getUncommittedEvents()
      .some((event) => event instanceof RoleDeletedEvent);
    if (deleted) {
      this.rows.delete(role.id);
      role.acknowledgePersisted();
      return null;
    }
    const taken = [...this.rows.values()].some(
      (row) => row.name === role.name && row.id !== role.id,
    );
    if (taken) throw new UniqueRoleNameException(role);
    const snapshot = role.toJSON();
    this.rows.set(role.id, snapshot);
    role.acknowledgePersisted();
    return snapshot;
  }

  async findById(id: string): Promise<Role | null> {
    const row = this.rows.get(id);
    return row ? Role.fromJSON(row) : null;
  }

  async find(query: Partial<GetRoleQuery>): Promise<Role | null> {
    return query.roleId ? this.findById(query.roleId) : null;
  }

  async list(): Promise<Role[]> {
    return [...this.rows.values()].map((row) => Role.fromJSON(row));
  }
}

const roles = new MemoryRoles();
let grants: string[] | undefined;
const { cqrs, audits } = await memoryCqrs('roles-spec');
const authorizer = new CaslAuthorizer();
cqrs.register(
  new GetRoleHandler(roles, authorizer),
  new GetRolesHandler({ find: () => roles.list() }, authorizer),
  new CreateRoleHandler(roles, authorizer, cqrs.eventBus),
  new UpdateRoleHandler(roles, authorizer, cqrs.eventBus),
  new DeleteRoleHandler(roles, authorizer, cqrs.eventBus),
);

const options = mountOptions(roleRoutes(cqrs), () => grants);
const fastify = await fastifyApp(options);

beforeAll(() => fastify.ready());
afterAll(async () => {
  await fastify.close();
  await cqrs.close();
});

beforeEach(() => {
  roles.rows.clear();
  audits.length = 0;
  grants = ADMIN;
});

describe.each([
  ['Express', () => expressApp(options)],
  ['Fastify', () => fastify.server],
])('the /roles routes on %s', (name, server) => {
  const create = (name: string) =>
    request(server()).post('/roles').send({ name });

  it('creates a role, answers 201 with it and audits the creation', async () => {
    const response = await create('editor');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: expect.any(String), name: 'editor' });
    expect(roles.rows.size).toBe(1);
    expect(audits).toEqual([
      expect.objectContaining({ action: 'role.create', outcome: 'success' }),
    ]);
  });

  it('runs a create once per idempotency key', async () => {
    const send = () =>
      request(server())
        .post('/roles')
        .set('idempotency-key', `create-editor-${name}`)
        .send({ name: 'editor' });

    const first = await send();
    const again = await send();

    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(roles.rows.size).toBe(1);
  });

  it('answers 409 for a taken name and 400 for a blank one', async () => {
    await create('editor');

    const taken = await create('editor');
    const blank = await create('   ');

    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({
      statusCode: 409,
      error: 'Conflict',
      message: 'Role with name "editor" already exists',
    });
    expect(blank.status).toBe(400);
    expect(blank.body.fieldErrors).toHaveProperty('name');
  });

  it('reads, lists, renames and deletes a role', async () => {
    const { id } = (await create('editor')).body;

    const read = await request(server()).get(`/roles/${id}`);
    const list = await request(server()).get('/roles');
    const renamed = await request(server())
      .patch(`/roles/${id}`)
      .send({ name: 'publisher' });
    const deleted = await request(server()).delete(`/roles/${id}`);
    const gone = await request(server()).get(`/roles/${id}`);

    expect(read.body).toEqual({ id, name: 'editor' });
    expect(list.body).toEqual({ roles: [{ id, name: 'editor' }] });
    expect(renamed.body).toEqual({ id, name: 'publisher' });
    expect(deleted.status).toBe(204);
    expect(gone.status).toBe(404);
    expect(gone.body).toMatchObject({ message: 'Role not found' });
  });

  it('answers a caller who may write but not read with an empty body', async () => {
    grants = ['Role|create|*', 'User|read|*'];

    const response = await create('editor');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({});
  });

  it('projects a read to the fields the caller may read', async () => {
    const { id } = (await create('editor')).body;
    grants = ['Role|read|*|name'];

    const response = await request(server()).get(`/roles/${id}`);

    expect(response.body).toEqual({ name: 'editor' });
  });

  it('denies a request without a principal with 403', async () => {
    grants = undefined;

    const response = await request(server()).get('/roles');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      statusCode: 403,
      error: 'Forbidden',
    });
  });

  it('answers 404 for a rename or delete of an unknown role', async () => {
    const id = '01999a7e-6b5e-7cc4-9a43-3e1f6c2b9d11';

    const renamed = await request(server())
      .patch(`/roles/${id}`)
      .send({ name: 'publisher' });
    const deleted = await request(server()).delete(`/roles/${id}`);

    expect(renamed.status).toBe(404);
    expect(deleted.status).toBe(404);
  });
});
