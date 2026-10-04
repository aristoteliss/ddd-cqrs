---
title: "@cqrs-ddd/cqrs"
description: "Command, query and event buses with handler decorators and a pipeline per handler, built by createCqrs() with no container."
sidebar:
  order: 2
---

Runs commands, queries, and events through their decorated handlers, each compiled inside its own pipeline of behaviors. 

`@CommandHandler`, `@QueryHandler`, and `@EventsHandler` mark handler classes; `@UsePipeline` and `@SkipPipeline` from `@cqrs-ddd/pipeline` declare their behaviors; `createCqrs()` builds the runtime buses (`CommandBus`, `QueryBus`, `EventBus`, `UnhandledExceptionBus`). There is no dependency-injection container or framework: the application instantiates handlers with `new`, passes required dependencies directly, and registers them.

Use `@cqrs-ddd/cqrs` for framework-free architectures (plain Node.js, Fastify, Express, serverless). If you are building on NestJS, use [`@cqrs-ddd/nestjs`](/ddd-cqrs/packages/nestjs/) instead to wrap official `@nestjs/cqrs` handlers.

## Installation

```bash
pnpm add @cqrs-ddd/cqrs @cqrs-ddd/pipeline
```

Requires Node.js 22.12 or later. Decorators support both TypeScript 5+ standard decorators and legacy `experimentalDecorators`.

## Quick Example

```typescript
import {
  CommandHandler,
  createCqrs,
  type EventBus,
  type ICommandHandler,
} from '@cqrs-ddd/cqrs';
import { LoggingBehavior, UsePipeline } from '@cqrs-ddd/pipeline';
import { AuditBehavior, audit } from '@cqrs-ddd/pipeline-audit';
import { validated } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

const CreateUserSchema = z.object({ email: z.string().email() });

class CreateUserCommand {
  constructor(readonly email: string) {}
}

@CommandHandler(CreateUserCommand)
@UsePipeline(
  validated(CreateUserSchema),
  audit({ action: 'user.create' }),
)
class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    private readonly users: UsersRepository,
    private readonly events: EventBus,
  ) {}

  async execute(command: CreateUserCommand): Promise<string> {
    const user = await this.users.create(command.email);
    this.events.publish(new UserCreatedEvent(user.id));
    return user.id;
  }
}

// Composition Root
const cqrs = createCqrs({
  behaviors: [new AuditBehavior(postgresAuditSink)],
  globalBehaviors: { before: [LoggingBehavior] },
});

cqrs.register(new CreateUserHandler(usersRepo, cqrs.eventBus));

// Dispatch
const userId = await cqrs.commandBus.execute<CreateUserCommand, string>(
  new CreateUserCommand('user@example.com'),
);

await cqrs.close();
```

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
2. **Behavior ordering**: Global `before` behaviors wrap outer handler behaviors, followed by inner handler behaviors, the handler's business method, and `after` behaviors. See [Execution Order](/ddd-cqrs/concepts/execution-order/).
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
