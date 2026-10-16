---
title: "@cqrs-ddd/cqrs"
description: "Command, query and event buses with handler decorators and a pipeline per handler, built by createCqrs() with no container."
sidebar:
  order: 2
---

Runs commands, queries, and events through their decorated handlers, each compiled inside its own pipeline of behaviors. 

`@CommandHandler`, `@QueryHandler`, and `@EventsHandler` mark handler classes; `@UsePipeline` and `@SkipPipeline` from `@cqrs-ddd/pipeline` declare their behaviors; `createCqrs()` builds the runtime buses (`CommandBus`, `QueryBus`, `EventBus`, `UnhandledExceptionBus`). There is no dependency-injection container or framework: the application instantiates handlers with `new`, passes required dependencies directly, and registers them.

Use `@cqrs-ddd/cqrs` for framework-free architectures (plain Node.js, Fastify, Express). If you are building on NestJS, use [`@cqrs-ddd/nestjs`](/ddd-cqrs/packages/nestjs/) instead to wrap official `@nestjs/cqrs` handlers.

## Installation

```bash
pnpm add @cqrs-ddd/cqrs @cqrs-ddd/pipeline
```

Requires Node.js 22.12 or later. Decorators support both TypeScript 5+ standard decorators and legacy `experimentalDecorators`.

## Quick Example

A complete application in one file: a command with a validated payload, its handler, an event and its handler, built and registered without a container. In an empty directory:

```bash
pnpm add @cqrs-ddd/cqrs @cqrs-ddd/pipeline @cqrs-ddd/pipeline-zod zod
pnpm add -D typescript @types/node
```

Save this as `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "strict": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["create-user.mts"]
}
```

Save this as `create-user.mts`; the `.mts` extension makes it an ES module without a `package.json` setting:

```ts
import {
  CommandHandler,
  createCqrs,
  type EventBus,
  EventsHandler,
  type ICommandHandler,
  type IEventHandler,
} from '@cqrs-ddd/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { validated, ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

class CreateUserCommand {
  constructor(readonly email: string) {}
}

class UserCreatedEvent {
  constructor(
    readonly id: string,
    readonly email: string,
  ) {}
}

@CommandHandler(CreateUserCommand)
@UsePipeline(validated(z.object({ email: z.email() })))
class CreateUserHandler implements ICommandHandler<CreateUserCommand, string> {
  constructor(
    private readonly users: Map<string, string>,
    private readonly events: EventBus,
  ) {}

  async execute(command: CreateUserCommand): Promise<string> {
    const id = `user_${this.users.size + 1}`;
    this.users.set(id, command.email);
    this.events.publish(new UserCreatedEvent(id, command.email));
    return id;
  }
}

@EventsHandler(UserCreatedEvent)
class WelcomeUser implements IEventHandler<UserCreatedEvent> {
  async handle(event: UserCreatedEvent): Promise<void> {
    console.log(`Welcome, ${event.email}`);
  }
}

const cqrs = createCqrs();
cqrs.register(
  new CreateUserHandler(new Map(), cqrs.eventBus),
  new WelcomeUser(),
);

const id = await cqrs.commandBus.execute<CreateUserCommand, string>(
  new CreateUserCommand('ada@example.com'),
);
console.log(`Created ${id}`);

try {
  await cqrs.commandBus.execute(new CreateUserCommand('not-an-email'));
} catch (error) {
  if (!(error instanceof ZodValidationError)) throw error;
  console.log('Invalid email rejected before the handler ran');
}

await cqrs.close();
```

Compile and run it:

```bash
pnpm exec tsc
node dist/create-user.mjs
```

It prints:

```text
Wrapping CreateUserHandler.execute() [command] with pipeline: [ZodValidationBehavior]
Welcome, ada@example.com
Created user_1
Invalid email rejected before the handler ran
```

The first line is the summary `register()` logs for each handler it compiles, at the `bootstrapLogLevel`. The event handler runs as soon as the event is published, before the command returns its result. The users live in a `Map`: nothing is stored. [CQRS without NestJS](/ddd-cqrs/guides/cqrs/) builds a larger application with ports, a query and behaviors that take their own instances.

## `createCqrs` Configuration Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `behaviors` | `IPipelineBehavior[]` | `[]` | Singleton behavior instances provided to pipelines. Placed behaviors without an explicit instance are constructed via zero-argument `new`. |
| `globalBehaviors` | `GlobalBehaviorsOptions \| GlobalBehaviorsOptions[]` | none | Behaviors placed around every handler across defined scopes (`'all'`, `'commands'`, `'queries'`, `'events'`). |
| `sources` | `ContextSources` | none | Where pipelines read and restore the `tenantId` and `correlationId`, such as `tenantSource` and `correlationSource`. |
| `diagnostics` | `'strict' \| 'warn' \| 'off'` | `'strict'` | Diagnostic contract check mode at `register()`: `'strict'` throws `PipelineConfigurationError`; `'warn'` logs; `'off'` disables checks. |
| `logger` | `PipelineLogger` | `console` | Destination logger for pipeline execution, diagnostics, and unhandled event errors. `pinoLogger(pino)` adapts Pino. |
| `bootstrapLogLevel` | `LogLevel \| 'none'` | `'debug'` | Log level for the summary line printed when compiling each handler's pipeline. |
| `rethrowUnhandled` | `boolean` | `false` | When `true`, uncaught errors in asynchronous event handlers are thrown as uncaught process exceptions instead of logged. |

`createCqrs()` returns `{ commandBus, queryBus, eventBus, unhandledExceptionBus, register, close }`.

## Handler Architecture & Invariants

| Decorator | Interface | Method | Invariant |
| --- | --- | --- | --- |
| `@CommandHandler(CommandClass)` | `ICommandHandler<TCommand, TResult>` | `execute(command)` | Exactly one handler per command class. Registering a duplicate throws immediately at startup. |
| `@QueryHandler(QueryClass)` | `IQueryHandler<TQuery, TResult>` | `execute(query)` | Exactly one handler per query class. Registering a duplicate throws immediately at startup. |
| `@EventsHandler(...EventClasses)` | `IEventHandler<TEvent>` | `handle(event)` | Any number of handlers per event class. Handlers execute concurrently when the event is published. |

### Request Class Inheritance

If a command or query instance has no handler directly registered for its concrete constructor, the bus searches up the prototype hierarchy and dispatches to the handler registered for its nearest parent class.

Requests can be arbitrary classes. Classes extending `BaseCommand` or `BaseQuery` from `@cqrs-ddd/core/application` carry the `REQUEST_KIND` brand, so behaviors can tell a command from a query, and an optional session principal kept out of their enumerable fields.

### Generic Result Typing

Buses accept generic type parameters on `execute()`:

```typescript
const result = await cqrs.queryBus.execute<GetUserQuery, UserDto>(new GetUserQuery('u_1'));
```

## Pipeline Execution Semantics

Handlers declare their pipeline using `@UsePipeline(...entries)` and `@SkipPipeline(...Behaviors)` from `@cqrs-ddd/pipeline`:

1. **Compilation at registration**: When `cqrs.register(...handlers)` runs, each handler's pipeline is compiled into an optimized runner function once. No dynamic metadata reflection occurs during request dispatch.
2. **Behavior ordering**: A call enters the global `before` behaviors first, then the handler's own behaviors in declaration order, then the global `after` behaviors, and reaches the handler's `execute` method last; the result returns through the same behaviors in reverse. `after` names a position, the one closest to the handler, not a step that runs once the handler has finished. See [Execution Order](/ddd-cqrs/concepts/execution-order/).
3. **Execution context**: Every execution receives an `IPipelineContext` containing `handlerName`, `requestName`, `requestKind`, `correlationId`, `tenantId`, and typed `items`.
4. **Skip isolation**: `@SkipPipeline(LoggingBehavior)` removes the specified global behavior for that handler without affecting other handlers.

## Buses in Detail

### `CommandBus`

- **Purpose**: Modifies application or domain state.
- **Dispatch**: `commandBus.execute(command)` awaits the handler's pipeline and returns the result.
- **Missing Handler**: If no handler is registered, rejects with `CommandHandlerNotFoundException`.

### `QueryBus`

- **Purpose**: Reads data without mutating state.
- **Dispatch**: `queryBus.execute(query)` awaits the handler's pipeline and returns the query result.
- **Missing Handler**: If no handler is registered, rejects with `QueryHandlerNotFoundException`.

### `EventBus`

- **Purpose**: Publishes domain and integration events across bounded contexts.
- **Dispatch**: `eventBus.publish(event)` and `eventBus.publishAll(events)` notify all registered event handlers.
- **Asynchronous non-blocking execution**: `publish()` triggers handlers and returns immediately without waiting for handler promises to resolve. Synchronous initialization runs before returning.
- **Missing Handlers**: Events published with zero registered handlers are safely ignored.
- **In-process delivery**: An event exists only in memory until its handlers have run. A pipeline around a handler adds no durable messaging and no outbox: see [Caveats](#caveats--production-guidelines).
- **DDD Integration**: `EventBus` implements `IDomainEventPublisher` from `@cqrs-ddd/core/application`, allowing `CommandBaseHandler` to publish buffered aggregate domain events directly.

### `UnhandledExceptionBus`

- **Purpose**: Centralized handling for asynchronous event handler failures.
- When an event handler promise rejects, the failure cannot be returned to the publisher. The bus emits the error and the event to `UnhandledExceptionBus`.
- By default, unhandled exceptions are logged at `'error'`.
- Subscribing to notifications:
  ```typescript
  const subscription = cqrs.unhandledExceptionBus.subscribe(({ exception, cause }) => {
    alerts.captureException(exception, { extra: { event: cause } });
  });

  // Later:
  subscription.unsubscribe();
  ```
- If `rethrowUnhandled: true` is configured in `createCqrs()`, failures are rethrown as uncaught exceptions, triggering process termination or orchestrator restart.

## Graceful Shutdown

Always await `cqrs.close()` before closing downstream infrastructure (database pools, message brokers, caches):

```typescript
process.on('SIGTERM', async () => {
  // 1. Stop accepting new HTTP traffic
  await server.close();

  // 2. Wait for in-flight asynchronous event handlers to complete
  await cqrs.close();

  // 3. Close database and cache connections
  await dbPool.end();
  await redis.quit();
});
```

`cqrs.close()` tracks all pending asynchronous event handler executions and resolves only once all in-flight handlers have finished.

## Caveats & Production Guidelines

1. **In-process delivery only**: Handlers run in the Node.js event loop. If the process crashes before an event handler runs, the event is lost. For durable, guaranteed delivery across services, combine domain events with a Transactional Outbox pattern.
2. **Handlers are singletons**: Handler instances are created once and shared across all requests. Handlers must be stateless; request-scoped state (user identity, correlation tokens, tenant IDs) must be read from `AsyncLocalStorage` via context sources.
3. **No prototype patching**: Multiple independent CQRS runtimes can exist in the same Node.js process without interfering with each other.

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/cqrs/)
