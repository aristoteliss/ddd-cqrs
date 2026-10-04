/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { CaslAuthorizer } from '@cqrs-ddd/pipeline-casl';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { memoryCqrs, mountOptions } from '../../test/support/harness.js';
import { expressApp } from '../http/express.js';
import { fastifyApp } from '../http/fastify.js';
import { Role } from '../roles/domain/models/role.entity.js';
import { CreateUserHandler } from './application/cqrs/commands/create-user.handler.js';
import { DeleteUserHandler } from './application/cqrs/commands/delete-user.handler.js';
import { EMPTY_USER_UPDATE_MESSAGE } from './application/cqrs/commands/update-user.command.js';
import { UpdateUserHandler } from './application/cqrs/commands/update-user.handler.js';
import { UserCreatedHandler } from './application/cqrs/events/user-created.handler.js';
import { UserUpdatedHandler } from './application/cqrs/events/user-updated.handler.js';
import { GetUserHandler } from './application/cqrs/queries/get-user.handler.js';
import type { GetUserQuery } from './application/cqrs/queries/get-user.query.js';
import { GetUserOverviewHandler } from './application/cqrs/queries/get-user-overview.handler.js';
import { GetUsersHandler } from './application/cqrs/queries/get-users.handler.js';
import type {
  UserBatchDispatchItem,
  WelcomeEmailDispatch,
} from './application/ports/user-event-dispatcher.port.js';
import { UserDeletedEvent } from './domain/events/user-deleted.event.js';
import { UniqueEmailException } from './domain/models/errors/index.js';
import { User, type UserSnapshot } from './domain/models/user.entity.js';
import { userRoutes } from './routes.js';

const ADMIN = ['User|manage|*', 'UserCapabilities|read|*', 'Role|read|*'];

class MemoryUsers {
  readonly rows = new Map<string, UserSnapshot>();

  async save(user: User): Promise<UserSnapshot | null> {
    const deleted = user
      .getUncommittedEvents()
      .some((event) => event instanceof UserDeletedEvent);
    if (deleted) {
      this.rows.delete(user.id);
      user.acknowledgePersisted();
      return null;
    }
    const taken = [...this.rows.values()].some(
      (row) => row.email === user.email && row.id !== user.id,
    );
    if (taken) throw new UniqueEmailException(user);
    const snapshot = user.toJSON();
    this.rows.set(user.id, snapshot);
    user.acknowledgePersisted();
    return snapshot;
  }

  async findById(id: string): Promise<User | null> {
    const row = this.rows.get(id);
    return row ? User.fromJSON(row) : null;
  }

  async find(query: Partial<GetUserQuery>): Promise<User | null> {
    const row = [...this.rows.values()].find(
      (candidate) =>
        candidate.id === query.userId || candidate.email === query.email,
    );
    return row ? User.fromJSON(row) : null;
  }

  async list(): Promise<User[]> {
    return [...this.rows.values()].map((row) => User.fromJSON(row));
  }
}

const users = new MemoryUsers();
const editor = Role.create('editor');
const welcomes: WelcomeEmailDispatch[] = [];
const batches: (readonly UserBatchDispatchItem[])[] = [];
let grants: string[] | undefined;

const { cqrs, audits } = await memoryCqrs('users-spec');
const authorizer = new CaslAuthorizer();
const dispatcher = {
  enqueueWelcomeEmail: async (message: WelcomeEmailDispatch) =>
    void welcomes.push(message),
  enqueueUserBatch: async (items: readonly UserBatchDispatchItem[]) =>
    void batches.push(items),
};
cqrs.register(
  new GetUserHandler(users, authorizer),
  new GetUsersHandler({ find: () => users.list() }, authorizer),
  new GetUserOverviewHandler(
    users,
    {
      find: async () => ({
        roles: ['editor'],
        additionalCapabilities: [{ subject: 'Report', action: 'read' }],
      }),
    },
    { find: async () => [editor] },
    authorizer,
  ),
  new CreateUserHandler(users, authorizer, cqrs.eventBus),
  new UpdateUserHandler(users, authorizer, cqrs.eventBus),
  new DeleteUserHandler(users, authorizer, cqrs.eventBus),
  new UserCreatedHandler(dispatcher),
  new UserUpdatedHandler(dispatcher),
);

const options = mountOptions(userRoutes(cqrs), () => grants);
const fastify = await fastifyApp(options);

beforeAll(() => fastify.ready());
afterAll(async () => {
  await fastify.close();
  await cqrs.close();
});

beforeEach(() => {
  users.rows.clear();
  audits.length = 0;
  welcomes.length = 0;
  batches.length = 0;
  grants = ADMIN;
});

describe.each([
  ['Express', () => expressApp(options)],
  ['Fastify', () => fastify.server],
])('the /users routes on %s', (name, server) => {
  const create = (body: object) => request(server()).post('/users').send(body);
  const ann = { name: 'Ann', email: `ann@${name.toLowerCase()}.test` };

  it('creates a user, answers 201 with it and enqueues the welcome email', async () => {
    const response = await create({ ...ann, department: 'sales' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      email: ann.email,
      name: 'Ann',
      department: 'sales',
    });
    await vi.waitFor(() =>
      expect(welcomes).toEqual([
        { userId: response.body.id, username: 'Ann', email: ann.email },
      ]),
    );
    expect(audits).toEqual([
      expect.objectContaining({ action: 'user.create', outcome: 'success' }),
    ]);
  });

  it('runs a create once per idempotency key', async () => {
    const send = () =>
      request(server())
        .post('/users')
        .set('idempotency-key', `create-ann-${name}`)
        .send(ann);

    const first = await send();
    const again = await send();

    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(users.rows.size).toBe(1);
  });

  it('answers 409 for a taken email and 400 for an invalid body', async () => {
    await create(ann);

    const taken = await create(ann);
    const invalid = await create({ name: 'A', email: 'not-an-email' });

    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ statusCode: 409, error: 'Conflict' });
    expect(invalid.status).toBe(400);
    expect(Object.keys(invalid.body.fieldErrors).sort()).toEqual([
      'email',
      'name',
    ]);
  });

  it('reads, lists, updates and deletes a user', async () => {
    const { id } = (await create(ann)).body;

    const read = await request(server()).get(`/users/${id}`);
    const list = await request(server()).get('/users');
    const updated = await request(server())
      .patch(`/users/${id}`)
      .send({ department: 'support' });
    const deleted = await request(server()).delete(`/users/${id}`);
    const gone = await request(server()).get(`/users/${id}`);

    expect(read.body).toEqual({
      id,
      email: ann.email,
      name: 'Ann',
      department: null,
    });
    expect(list.body).toEqual({ users: [read.body] });
    expect(updated.body).toEqual({ ...read.body, department: 'support' });
    await vi.waitFor(() =>
      expect(batches).toEqual([[{ userId: id, username: 'Ann' }]]),
    );
    expect(deleted.status).toBe(204);
    expect(gone.status).toBe(404);
    expect(gone.body).toMatchObject({ message: 'User not found' });
  });

  it('answers 400 for an update without a field', async () => {
    const { id } = (await create(ann)).body;

    const response = await request(server()).patch(`/users/${id}`).send({});

    expect(response.status).toBe(400);
    expect(response.body.formErrors).toEqual([EMPTY_USER_UPDATE_MESSAGE]);
  });

  it('answers the overview with the roles and capabilities the caller may read', async () => {
    const { id } = (await create(ann)).body;

    const full = await request(server()).get(`/users/${id}/overview`);
    grants = ['User|read|*'];
    const plain = await request(server()).get(`/users/${id}/overview`);

    expect(full.body).toEqual({
      id,
      username: 'Ann',
      email: ann.email,
      department: null,
      roles: ['editor'],
      capabilities: ['Report:read'],
    });
    expect(plain.body).toEqual({
      id,
      username: 'Ann',
      email: ann.email,
      department: null,
    });
  });

  it('answers 404 for the overview of an unknown user', async () => {
    const response = await request(server()).get(
      '/users/01999a7e-6b5e-7cc4-9a43-3e1f6c2b9d11/overview',
    );

    expect(response.status).toBe(404);
  });

  it('answers a caller who may create but not read with an empty body', async () => {
    grants = ['User|create|*'];

    const response = await create(ann);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({});
  });

  it('denies a request without a principal with 403', async () => {
    grants = undefined;

    const response = await request(server()).get('/users');

    expect(response.status).toBe(403);
  });
});
