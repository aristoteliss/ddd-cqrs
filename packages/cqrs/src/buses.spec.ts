/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { CommandBus } from './command.bus.js';
import type { RequestType } from './decorators.js';
import type { Dispatch } from './dispatch.js';
import {
  CommandHandlerNotFoundException,
  QueryHandlerNotFoundException,
} from './errors.js';
import { QueryBus } from './query.bus.js';

class CreateUser {
  constructor(readonly name: string) {}
}
class CreateAdmin extends CreateUser {}
class DeleteUser {}
class GetUser {
  constructor(readonly id: string) {}
}
class GetActiveUser extends GetUser {}

describe('CommandBus', () => {
  it('runs the handler of the command class and resolves with its result', async () => {
    const bus = new CommandBus(
      new Map<RequestType, Dispatch>([
        [CreateUser, async (c) => `created ${(c as CreateUser).name}`],
      ]),
    );
    const id = await bus.execute<CreateUser, string>(new CreateUser('ann'));
    expect(id).toBe('created ann');
  });

  it('reads handlers added after the bus was created', async () => {
    const handlers = new Map<RequestType, Dispatch>();
    const bus = new CommandBus(handlers);
    handlers.set(DeleteUser, async () => 'deleted');
    await expect(bus.execute(new DeleteUser())).resolves.toBe('deleted');
  });

  it("falls back to the nearest parent class's handler", async () => {
    const handlers = new Map<RequestType, Dispatch>([
      [CreateUser, async () => 'user'],
    ]);
    const bus = new CommandBus(handlers);
    await expect(bus.execute(new CreateAdmin('ann'))).resolves.toBe('user');

    handlers.set(CreateAdmin, async () => 'admin');
    await expect(bus.execute(new CreateAdmin('ann'))).resolves.toBe('admin');
  });

  it('rejects a command without a handler, naming its class', async () => {
    const bus = new CommandBus(new Map());
    const pending = bus.execute(new DeleteUser());
    await expect(pending).rejects.toBeInstanceOf(
      CommandHandlerNotFoundException,
    );
    await expect(pending).rejects.toThrow(
      'No handler found for the command: "DeleteUser".',
    );
  });
});

describe('QueryBus', () => {
  it('runs the handler of the query class, or of its nearest parent class', async () => {
    const bus = new QueryBus(
      new Map<RequestType, Dispatch>([
        [GetUser, async (q) => (q as GetUser).id],
      ]),
    );
    const user = await bus.execute<GetUser, string | null>(new GetUser('u-1'));
    expect(user).toBe('u-1');
    await expect(bus.execute(new GetActiveUser('u-2'))).resolves.toBe('u-2');
  });

  it('rejects a query without a handler, naming its class', async () => {
    const pending = new QueryBus(new Map()).execute(new GetUser('u-1'));
    await expect(pending).rejects.toBeInstanceOf(QueryHandlerNotFoundException);
    await expect(pending).rejects.toThrow(
      'No handler found for the query: "GetUser"',
    );
  });
});
