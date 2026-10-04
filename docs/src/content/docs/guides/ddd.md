---
title: DDD without a framework
description: Run @cqrs-ddd/core commands and their handlers through a pipeline, with events published inside the chain.
sidebar:
  order: 5
---

This guide runs a `@cqrs-ddd/core` command handler through a `@cqrs-ddd/pipeline`
pipeline, with no framework and no container. The two packages do not depend on each
other. For buses and decorated handlers, see
[CQRS without NestJS](/ddd-cqrs/guides/cqrs/).

## The aggregate

`User` changes its state only through the events it applies: `rename()` records a
`UserRenamedEvent`, and `onUserRenamedEvent` applies it.

```ts
import { AggregateRoot, DomainEvent } from '@cqrs-ddd/core/domain';

export class UserRenamedEvent extends DomainEvent {
  constructor(
    readonly userId: string,
    readonly name: string,
  ) {
    super();
  }
}

export class User extends AggregateRoot {
  #name: string;

  constructor(
    readonly id: string,
    name: string,
  ) {
    super();
    this.#name = name;
  }

  rename(name: string): this {
    if (name !== this.#name) this.apply(new UserRenamedEvent(this.id, name));
    return this;
  }

  protected onUserRenamedEvent(event: UserRenamedEvent): void {
    this.#name = event.name;
  }
}
```

## The pipeline

Every command is audited, here into an in-memory trail:

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import { AuditBehavior, type AuditRecord } from '@cqrs-ddd/pipeline-audit';

export const auditTrail: AuditRecord[] = [];

export const pipeline = createPipeline({
  behaviors: [new AuditBehavior({ write: (record) => void auditTrail.push(record) })],
});
```

## The command and its handler

`RenameUserCommand` extends `BaseCommand`, which carries the `REQUEST_KIND` brand, so the
pipeline knows it is a command and names the operation `RenameUserCommand`. The decorator
needs no options: `@pipeline.wrap(audit(...))`.

`CommandBaseHandler.execute()` calls `handle()` and then publishes the aggregate's events.
The handler overrides `execute()` only to decorate it, so the whole of it, the publication
included, runs inside the pipeline: behaviors see the events as part of the command, and a
failed publication fails the command.

```ts
import { BaseCommand, CommandBaseHandler, type IDomainEventPublisher } from '@cqrs-ddd/core/application';
import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import { audit } from '@cqrs-ddd/pipeline-audit';

export class RenameUserCommand extends BaseCommand {
  constructor(
    readonly userId: string,
    readonly name: string,
  ) {
    super();
  }
}

export class RenameUserHandler extends CommandBaseHandler<RenameUserCommand, User> {
  constructor(
    private readonly users: Map<string, User>,
    eventBus: IDomainEventPublisher,
  ) {
    super(eventBus);
  }

  async handle(command: RenameUserCommand): Promise<User> {
    const user = this.users.get(command.userId);
    if (!user) throw new EntityNotFoundException('User', command.userId);
    return user.rename(command.name);
  }

  @pipeline.wrap(audit({ action: 'user.rename', severity: 'medium' }))
  override async execute(command: RenameUserCommand): Promise<User> {
    return super.execute(command);
  }
}
```

## Running it

The audit record carries the name and kind taken from the command and the handler name
`RenameUserHandler.execute`; the event is published while the pipeline runs.

```ts
const users = new Map([['u-1', new User('u-1', 'Ann')]]);
const published: unknown[] = [];
const handler = new RenameUserHandler(users, {
  publishAll: (events) => void published.push(...events),
});

await handler.execute(new RenameUserCommand('u-1', 'Anna'));
auditTrail[0]; // { requestKind: 'command', requestName: 'RenameUserCommand', handlerName: 'RenameUserHandler.execute', … }
published; // [UserRenamedEvent]
```

The code compiles with `experimentalDecorators: true`. Persistence is a `Map`; a real
application implements the repository contracts of
[`@cqrs-ddd/core`](/ddd-cqrs/packages/core/), with
[`@cqrs-ddd/mikro-orm`](/ddd-cqrs/packages/mikro-orm/) or its own adapter.

## In the repository

The code of this guide runs in [`integration/profiles/`](https://github.com/aristoteliss/ddd-cqrs/tree/master/integration/profiles), and
[`integration/members/`](https://github.com/aristoteliss/ddd-cqrs/tree/master/integration/members) puts the same kind of aggregate on the
`@cqrs-ddd/cqrs` buses. Two more applications use `@cqrs-ddd/core` without a pipeline or
buses:

- [`integration/library/`](https://github.com/aristoteliss/ddd-cqrs/tree/master/integration/library): a book aggregate with value rules,
  `@Mutable` fields and `@ApplyMutation` methods, and `CommandBaseHandler` subclasses
  that publish its events over an in-memory repository. A refused loan stores and
  publishes nothing; a write from a stale copy fails with `ConcurrencyConflictError`.
- [`integration/inventory/`](https://github.com/aristoteliss/ddd-cqrs/tree/master/integration/inventory): repositories that declare their
  persistence with the core decorators, over MikroORM on in-memory SQLite, with the
  repository cache in the same database:

  ```ts
  @PersistedWrite<Product>({
    cache: { setKey: (product) => productKey(product.id) },
    unique: { sku: (product) => new DuplicateSkuException(product) },
  })
  async save(product: Product): Promise<ProductSnapshot> { … }
  ```

[`api/`](https://github.com/aristoteliss/ddd-cqrs/tree/master/api) uses both families
together, on the `@cqrs-ddd/cqrs` buses.
