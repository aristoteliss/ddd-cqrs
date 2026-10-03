---
title: "@cqrs-ddd/cqrs"
description: "Command, query and event buses with handler decorators and a pipeline per handler, built by createCqrs() with no container."
sidebar:
  order: 2
---

Runs commands, queries and events through their handlers, each inside its own pipeline of
behaviors. `@CommandHandler`, `@QueryHandler` and `@EventsHandler` mark the handler
classes; `@UsePipeline` and `@SkipPipeline` declare their behaviors; `createCqrs()` builds
the `CommandBus`, `QueryBus` and `EventBus`. There is no container: the application builds
its handlers with `new`, passing what they need, and registers them.

Use it when an application is organized around commands, queries and events. To wrap a
few functions or methods, [`@cqrs-ddd/pipeline`](/ddd-cqrs/packages/pipeline/) alone is
enough.

## Installation

```bash
pnpm add @cqrs-ddd/cqrs @cqrs-ddd/pipeline
```

Requires Node.js 22.12 or later. The decorators work with TypeScript's standard decorators
and with `experimentalDecorators`.

## Usage

```ts
import {
  Command,
  CommandHandler,
  createCqrs,
  type EventBus,
  type ICommandHandler,
  UsePipeline,
} from '@cqrs-ddd/cqrs';
import { LoggingBehavior } from '@cqrs-ddd/pipeline';
import { AuditBehavior, audit } from '@cqrs-ddd/pipeline-audit';

class CreateUserCommand extends Command<string> {
  constructor(readonly name: string) {
    super();
  }
}

@CommandHandler(CreateUserCommand)
@UsePipeline(audit({ action: 'user.create' }))
class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    private readonly users: Users,
    private readonly events: EventBus,
  ) {}

  async execute(command: CreateUserCommand) {
    const user = await this.users.add(command.name);
    this.events.publish(new UserCreatedEvent(user.id));
    return user.id;
  }
}

const cqrs = createCqrs({
  behaviors: [new AuditBehavior(new PostgresAuditSink(pool))],
  globalBehaviors: { before: [LoggingBehavior] },
});
cqrs.register(new CreateUserHandler(users, cqrs.eventBus));

const id = await cqrs.commandBus.execute(new CreateUserCommand('Ann'));
await cqrs.close();
```

## createCqrs options

| Option | Meaning | Default |
| --- | --- | --- |
| `behaviors` | behavior instances, one per class; a placed behavior without an instance is built with no arguments | none |
| `globalBehaviors` | behaviors around every handler of a scope: `{ scope, before, after }` or an array of them | none |
| `sources` | where executions take their tenant and correlation id from | none |
| `diagnostics` | what a contract violation does at `register()`: `'strict'` throws `PipelineConfigurationError`, `'warn'` logs, `'off'` ignores | `'strict'` |
| `logger` | the logger of `LoggingBehavior`, of failed event handlers and of the startup lines; `pinoLogger(pino)` adapts pino | `console` |
| `bootstrapLogLevel` | the level of the line that lists each handler's behaviors, or `'none'` | `'debug'` |
| `rethrowUnhandled` | throw a failed event handler's error as an uncaught exception | `false` |

Global behaviors are built by `createCqrs()`, so one whose required dependency is missing
fails there. Two instances of one behavior class are rejected.

`createCqrs()` returns `commandBus`, `queryBus`, `eventBus`, `eventPublisher`,
`unhandledExceptionBus`, `register(...handlers)` and `close()`. `register()` compiles each
handler's pipeline once and fails on an undecorated class, a second handler for one
command or query, or a behavior contract violation. `close()` waits for the event handlers
still running; call it before closing what they use.

## Handlers

| Decorator | The class implements | Registered for |
| --- | --- | --- |
| `@CommandHandler(Command)` | `ICommandHandler`: `execute(command)` | one command class; a second handler fails `register()` |
| `@QueryHandler(Query)` | `IQueryHandler`: `execute(query)` | one query class; a second handler fails `register()` |
| `@EventsHandler(...Events)` | `IEventHandler`: `handle(event)` | any number of event classes, each with any number of handlers |

A request class without a handler of its own uses the handler of its nearest parent class.
`Command<R>` and `Query<R>` are optional base classes that declare the result type, so
`commandBus.execute(new CreateUserCommand('Ann'))` is typed `Promise<string>`.

## The pipeline of a handler

`@UsePipeline(...entries)` declares a handler's behaviors, outermost first: behavior
classes or `[Behavior, options]` tuples such as `audit({ action })`. The global behaviors
wrap them; `@SkipPipeline(...Behaviors)` opts a handler out of global ones. The order and
the merging of options are those of [the execution order](/ddd-cqrs/concepts/execution-order/).

The pipeline context names the handler by its class (`CreateUserHandler`) and the request
by its class (`CreateUserCommand`), with the kind of the decorator. An event handler runs
in a pipeline of its own, inside the correlation of the command that published the event.

## Buses

- `CommandBus.execute(command)` and `QueryBus.execute(query)` run the handler and resolve
  with its result. Without a handler they reject with `CommandHandlerNotFoundException`
  or `QueryHandlerNotFoundException`.
- `EventBus.publish(event)` and `publishAll(events)` start every handler of the event and
  return without awaiting them; the synchronous part of each runs before `publish`
  returns. An event without handlers is dropped. `EventBus` satisfies
  `IDomainEventPublisher` of `@cqrs-ddd/core`, so a `CommandBaseHandler` takes it as its
  publisher.
- A failed event handler never reaches the publisher: the error is published on the
  `UnhandledExceptionBus`, then logged at `error`. `subscribe(next)` on that bus returns a
  subscription with `unsubscribe()`. With `rethrowUnhandled` the error is thrown as an
  uncaught exception instead.
- `EventPublisher.mergeObjectContext(aggregate)` and `mergeClassContext(Aggregate)` make an
  aggregate's `publish`, `publishAll` and `commit()` publish through the `EventBus`.

## Caveats

- Event handlers run in-process after the publisher returns; a crash loses the ones still
  running. Durable delivery needs an outbox.
- Handlers are the instances the application registers: one per class, shared by every
  request. Per-request data lives in `AsyncLocalStorage`, as the tenant and the
  correlation id of the pipeline packages do.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/cqrs/)
