---
title: CQRS without NestJS
description: An application of commands, queries and events on @cqrs-ddd/cqrs, with handler decorators, a pipeline per handler and buses built by createCqrs.
sidebar:
  order: 3
---

This guide builds a small users application on [`@cqrs-ddd/cqrs`](/ddd-cqrs/packages/cqrs/):
decorated handlers, a pipeline around each one, and buses built by `createCqrs()`. There is
no container: one function builds everything with `new`, so every dependency is visible
and checked by the compiler. The repository's `api/` is a complete application built the
same way.

## Ports

Handlers depend on ports, which the application implements: in memory for tests, on a
database in production.

```ts
export abstract class Users {
  abstract add(name: string): User;
  abstract find(id: string): User | undefined;
}

export abstract class Mailer {
  abstract send(to: string, text: string): Promise<void>;
}
```

## A command

`CreateUserCommand` extends `Command<string>`, so `commandBus.execute()` resolves with a
`string`. Its handler adds the user and publishes an event. `@UsePipeline` runs it once per
request id and audits it: a repeated `requestId` returns the first result without running
the handler again.

```ts
export class CreateUserCommand extends Command<string> {
  constructor(
    readonly requestId: string,
    readonly name: string,
  ) {
    super();
  }
}

@CommandHandler(CreateUserCommand)
@UsePipeline(
  idempotent({ keyFactory: (context) => (context.request as CreateUserCommand).requestId }),
  audit({ action: 'user.create' }),
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    private readonly users: Users,
    private readonly events: EventBus,
  ) {}

  async execute(command: CreateUserCommand): Promise<string> {
    const user = this.users.add(command.name);
    this.events.publish(new UserCreatedEvent(user.id, user.name));
    return user.id;
  }
}
```

## A query

The application logs every handler through a global `LoggingBehavior`;
`@SkipPipeline(LoggingBehavior)` leaves this one out.

```ts
@QueryHandler(GetUserQuery)
@SkipPipeline(LoggingBehavior)
export class GetUserHandler implements IQueryHandler<GetUserQuery> {
  constructor(private readonly users: Users) {}

  async execute(query: GetUserQuery): Promise<User | undefined> {
    return this.users.find(query.id);
  }
}
```

## An event handler

The event bus starts `SendWelcomeMail` inside `publish()` and does not await it, so the
command does not wait for the mail. It runs in a pipeline of its own, under the command's
correlation id.

```ts
@EventsHandler(UserCreatedEvent)
export class SendWelcomeMail implements IEventHandler<UserCreatedEvent> {
  constructor(private readonly mailer: Mailer) {}

  async handle(event: UserCreatedEvent): Promise<void> {
    await this.mailer.send(event.userId, `Welcome, ${event.name}!`);
  }
}
```

## The wiring

One function builds the application: the behavior instances that need dependencies, the
buses, then the handlers with their ports. `register()` compiles each handler's pipeline
and fails there on any configuration error.

```ts
import { createCqrs } from '@cqrs-ddd/cqrs';
import { LoggingBehavior } from '@cqrs-ddd/pipeline';
import { AuditBehavior } from '@cqrs-ddd/pipeline-audit';
import { IdempotencyBehavior, MemoryIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';

export function createApp(ports: { users: Users; mailer: Mailer; auditSink: AuditSink }) {
  const cqrs = createCqrs({
    behaviors: [
      new IdempotencyBehavior(new MemoryIdempotencyStore()),
      new AuditBehavior(ports.auditSink),
    ],
    globalBehaviors: { before: [LoggingBehavior] },
  });
  cqrs.register(
    new CreateUserHandler(ports.users, cqrs.eventBus),
    new GetUserHandler(ports.users),
    new SendWelcomeMail(ports.mailer),
  );
  return cqrs;
}
```

## Running it

`close()` waits for the event handlers still running, so after it the welcome mail has
been sent.

```ts
const app = createApp({ users: new MemoryUsers(), mailer, auditSink: new PostgresAuditSink(pool) });
const id = await app.commandBus.execute(new CreateUserCommand('req-1', 'Ann'));
const user = await app.queryBus.execute(new GetUserQuery(id));
await app.close();
```

[Coming from NestJS](/ddd-cqrs/guides/from-nestjs/) lists what changes when moving code
between the two.
