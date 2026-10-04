---
title: "@cqrs-ddd/nestjs"
description: "NestJS adapter for the @cqrs-ddd packages: runs @nestjs/cqrs handlers through behavior pipelines, maps errors to NestJS HttpExceptions, and wires correlation and job context."
sidebar:
  order: 3
---

The NestJS adapter for the [`@cqrs-ddd`](https://github.com/aristoteliss/ddd-cqrs) packages.

A NestJS application keeps idiomatic NestJS architecture: modules, dependency injection, controllers, and official `@nestjs/cqrs` (`CqrsModule`, `CommandBus`, `QueryBus`, `EventBus`, `@CommandHandler`, `@QueryHandler`, `@EventsHandler`). The adapter provides what `@nestjs/cqrs` lacks:

1. **Pipeline behaviors around handlers**: compiles and executes `@cqrs-ddd/pipeline` behaviors around every command, query, and event handler instance at application bootstrap.
2. **Standardized exception filtering**: `ErrorFilter` converts every `@cqrs-ddd` error (domain errors, validation failures, authorization denials, rate limits, idempotency conflicts, feature flags) into a NestJS `HttpException` with NestJS's standard response body and HTTP headers.
3. **Correlation ID propagation**: `CorrelationMiddleware` runs each request with the correlation id of its `x-correlation-id` header, or a new UUIDv7, and echoes it on the response.
4. **Asynchronous job context**: `JobContextModule` propagates tenants, correlation IDs, and principals to worker queues (such as BullMQ) and restores them in processors.
5. **Aggregate lifecycle integration**: commands extending `CommandBaseHandler` publish uncommitted aggregate domain events through the NestJS `EventBus`.

A complete working NestJS application demonstrating all patterns is available in the [nestjs-pipeline `api/`](https://github.com/aristoteliss/nestjs-pipeline/tree/master/api) repository.

## Installation

```bash
pnpm add @cqrs-ddd/nestjs @cqrs-ddd/pipeline @cqrs-ddd/core @nestjs/cqrs
```

### Peer Dependencies

- **Required peers**: `@nestjs/common`, `@nestjs/core` and `@nestjs/cqrs` 12, and `@cqrs-ddd/pipeline` and `@cqrs-ddd/core` 0.5. NestJS itself needs `reflect-metadata` and `rxjs`.
- **Optional peers**, installed when the application uses them:
  - `@cqrs-ddd/pipeline-zod`, `@cqrs-ddd/pipeline-casl`, `@cqrs-ddd/pipeline-feature-flags`, `@cqrs-ddd/pipeline-rate-limit` and `@cqrs-ddd/pipeline-idempotency`: `ErrorFilter` converts the errors of each one installed.
  - `@cqrs-ddd/pipeline-correlation`, for `@cqrs-ddd/nestjs/correlation`.
  - `@cqrs-ddd/pipeline-job-context`, for `@cqrs-ddd/nestjs/job-context`.

Any other behavior package (cache, resilience, audit, telemetry, dead letters) runs in the pipelines without the adapter knowing it.

## Architectural Lifecycle

The adapter operates via `PipelineBootstrap`, an `@Injectable()` service registered by `PipelineModule`:

```text
Nest Application Bootstrap
  │
  ├─ 1. OnApplicationBootstrap lifecycle hook runs
  │
  ├─ 2. DiscoveryService scans all registered providers
  │
  ├─ 3. Finds classes decorated with @CommandHandler, @QueryHandler, @EventsHandler
  │
  ├─ 4. Reads pipeline declarations (@UsePipeline, @SkipPipeline) via pipelineOf()
  │
  ├─ 5. Compiles plan (globalBehaviors + handler behaviors - skipped behaviors)
  │
  ├─ 6. Resolves behavior instances from Nest DI container by class token
  │
  ├─ 7. Validates static singleton scopes (fails fast if handler or behavior is request-scoped)
  │
  ├─ 8. Validates behavior contracts (ordering, required items, diagnostic checks)
  │
  └─ 9. Wraps handler instance method (execute for commands/queries, handle for events)
```

Key runtime guarantees:
- **Instance wrapping, not prototype mutation**: Only the current application's provider instances are wrapped. Handler class prototypes are never patched, allowing multiple isolated applications in one process.
- **Fail-fast validation**: Missing behavior providers, ambiguous duplicate providers, request-scoped handlers, or broken behavior contracts fail during application startup before the HTTP listener starts accepting traffic.
- **Clean teardown**: `OnModuleDestroy` restores original method descriptors on all wrapped handler instances.

## Pipeline Configuration

Import `PipelineModule.forRoot()` in your root module or core infrastructure module:

```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule } from '@cqrs-ddd/nestjs';
import { logging } from '@cqrs-ddd/pipeline';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { DeadLetterBehavior } from '@cqrs-ddd/pipeline-deadletter';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      sources: {
        tenantId: tenantSource,
        correlationId: correlationSource,
      },
      globalBehaviors: [
        { scope: 'all', before: [logging({ requestResponseLogLevel: 'log' })] },
        { scope: 'commands', before: [DeadLetterBehavior] },
      ],
      diagnostics: 'strict',
    }),
  ],
})
export class CorePipelineModule {}
```

### `PipelineOptions`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `globalBehaviors` | `GlobalBehaviorsOptions \| GlobalBehaviorsOptions[]` | none | Behaviors placed around handlers across defined scopes (`'all'`, `'commands'`, `'queries'`, `'events'`). |
| `sources` | `ContextSources` | none | Where pipelines read and restore the `tenantId` and `correlationId`, such as `tenantSource` of `@cqrs-ddd/pipeline-tenant` and `correlationSource` of `@cqrs-ddd/pipeline-correlation`. |
| `diagnostics` | `'strict' \| 'warn' \| 'off'` | `'strict'` | Validation mode for behavior contracts: `'strict'` throws `PipelineConfigurationError` on startup; `'warn'` logs warnings; `'off'` bypasses checks. |

## Registering Behaviors with Dependency Injection

Behaviors are plain classes configured with dependencies (loggers, Redis stores, database pools, CASL loaders). Each module provides the behavior instance it configures under the behavior's class token:

```typescript
import { Module, Logger } from '@nestjs/common';
import { LoggingBehavior } from '@cqrs-ddd/pipeline';
import { IdempotencyBehavior, RedisIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';
import { CaslBehavior } from '@cqrs-ddd/pipeline-casl';
import { RedisService } from '../redis/redis.service.js';
import { PermissionLoader } from '../auth/permission-loader.service.js';

@Module({
  providers: [
    {
      provide: LoggingBehavior,
      useFactory: () => new LoggingBehavior(new Logger('Pipeline')),
    },
    {
      provide: IdempotencyBehavior,
      inject: [RedisService],
      useFactory: (redis: RedisService) =>
        new IdempotencyBehavior(new RedisIdempotencyStore(redis.client)),
    },
    {
      provide: CaslBehavior,
      inject: [PermissionLoader],
      useFactory: (loader: PermissionLoader) => new CaslBehavior(loader),
    },
  ],
  exports: [LoggingBehavior, IdempotencyBehavior, CaslBehavior],
})
export class PipelineBehaviorsModule {}
```

### Provider Rules

1. **Singleton scope required**: Every behavior provider and every handler running behaviors must be static singletons (`Scope.DEFAULT`). If a handler or behavior is request-scoped (`Scope.REQUEST`), `PipelineBootstrap` fails startup immediately. Request-specific data must be accessed via `AsyncLocalStorage` or context sources.
2. **Single provider per behavior**: Exactly one module must provide each behavior class token. If two modules register providers for the same behavior token, `PipelineBootstrap` throws an error naming both modules to prevent ambiguity.

## Handlers and Declarations

Command, query, and event handlers use standard `@nestjs/cqrs` handler decorators. Use `@UsePipeline` and `@SkipPipeline` from `@cqrs-ddd/pipeline` to configure behaviors:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline, SkipPipeline } from '@cqrs-ddd/pipeline';
import { idempotent } from '@cqrs-ddd/pipeline-idempotency';
import { validated } from '@cqrs-ddd/pipeline-zod';
import { requires } from '@cqrs-ddd/pipeline-casl';
import { audit } from '@cqrs-ddd/pipeline-audit';
import { DeadLetterBehavior } from '@cqrs-ddd/pipeline-deadletter';
import { CreateOrderCommand, CreateOrderSchema } from './create-order.command.js';
import { OrdersRepository } from '../orders.repository.js';
import { orderIdempotencyKey } from './order-key.factory.js';

@CommandHandler(CreateOrderCommand)
@UsePipeline(
  requires({ action: 'create', subject: 'Order' }),
  validated(CreateOrderSchema),
  idempotent({ keyFactory: orderIdempotencyKey }),
  audit({ action: 'order.created' }),
)
@SkipPipeline(DeadLetterBehavior)
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(private readonly orders: OrdersRepository) {}

  async execute(command: CreateOrderCommand): Promise<string> {
    const order = await this.orders.create(command);
    return order.id;
  }
}
```

### Behavior Execution Flow

When a controller dispatches `commandBus.execute(command)`, the call enters the compiled pipeline of `CreateOrderHandler`. Behaviors nest like an onion, outermost first: the global `before` behaviors (logging), then the handler's own in declaration order (authorization, validation, idempotency, audit), then the global `after` behaviors. The handler's `execute(command)` runs innermost, with the validated command. Each behavior then sees the result, or the error, on the way out: audit records the outcome, idempotency stores the response, logging writes the duration. A behavior that throws, such as a denied authorization, stops the call before the inner ones run.

## Error Handling with `ErrorFilter`

`ErrorFilter` intercepts all `@cqrs-ddd` errors and translates them into standard NestJS `HttpException` instances matching Nest's default JSON error shape (`{ statusCode, message, error }`).

Register it globally in `AppModule`:

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ErrorFilter } from '@cqrs-ddd/nestjs';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: ErrorFilter,
    },
  ],
})
export class AppModule {}
```

### Error Translation Mapping

| Error Class | Source Package | HTTP Status | Response Body Shape | Extra Headers |
| --- | --- | --- | --- | --- |
| `ZodValidationError` | `@cqrs-ddd/pipeline-zod` | 400 Bad Request | `{ statusCode: 400, error: 'Bad Request', message: ['field: error message'] }` | — |
| `UnauthorizedActionException` | `@cqrs-ddd/pipeline-casl` | 403 Forbidden | `{ statusCode: 403, error: 'Forbidden', message, action, subject }` | — |
| `FeatureDisabledError` | `@cqrs-ddd/pipeline-feature-flags` | 403 Forbidden | `{ statusCode: 403, error: 'Forbidden', message, flag }` | — |
| `RateLimitExceededError` | `@cqrs-ddd/pipeline-rate-limit` | 429 Too Many Requests | `{ statusCode: 429, error: 'Too Many Requests', message, retryAfter }` | `Retry-After: <seconds>` |
| `IdempotencyConflictError` | `@cqrs-ddd/pipeline-idempotency` | 409 Conflict (`in_progress`, `replay_scope`) / 422 Unprocessable Entity (`key_reuse`) | `{ statusCode, error, message, idempotencyKey, reason }` | — |
| `EntityNotFoundException` | `@cqrs-ddd/core` | 404 Not Found | `{ statusCode: 404, error: 'Not Found', message: 'Order not found' }` | — |
| `ConcurrencyConflictError` | `@cqrs-ddd/core`, thrown by `@cqrs-ddd/mikro-orm` | 409 Conflict | `{ statusCode: 409, error: 'Conflict', message }` | — |
| `MissingTenantContextError` | `@cqrs-ddd/core` | 500 Internal Server Error | `{ statusCode: 500, error: 'Internal Server Error', message: 'Internal server error' }`: a server misconfiguration, its message kept out of the answer | — |
| any other `DomainException`, such as `InvalidValueException` | `@cqrs-ddd/core` or the application | 400 Bad Request | `{ statusCode: 400, error: 'Bad Request', message }` | — |

Unrecognized errors fall back to NestJS's default `BaseExceptionFilter` handling (returning 500 Internal Server Error for unhandled exceptions).

### Custom Exception Filters

To handle application-specific exceptions while retaining `@cqrs-ddd` error conversions, extend `ErrorFilter` or use `toHttpException` and `httpAnswer`:

```typescript
import { Catch, ArgumentsHost } from '@nestjs/common';
import { ErrorFilter } from '@cqrs-ddd/nestjs';
import { CustomBillingError } from './billing.errors.js';

@Catch()
export class CustomAppFilter extends ErrorFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof CustomBillingError) {
      const response = host.switchToHttp().getResponse();
      response.status(402).json({ statusCode: 402, message: exception.message });
      return;
    }
    super.catch(exception, host);
  }
}
```

## Correlation ID Middleware

`CorrelationMiddleware` takes the correlation id of each request from its `x-correlation-id` header, or generates a UUIDv7 when the header is absent or invalid, runs the request with it in `AsyncLocalStorage`, and sets the header on the response. It is `httpCorrelation()` of `@cqrs-ddd/pipeline-correlation` as a NestJS middleware, and works on Express and Fastify.

Register in `AppModule`:

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { CorrelationMiddleware } from '@cqrs-ddd/nestjs/correlation';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
```

Pipelines take it through `sources: { correlationId: correlationSource }`; read it anywhere else with `getCorrelationId()`:

```typescript
import { getCorrelationId } from '@cqrs-ddd/pipeline-correlation';

logger.info({ correlationId: getCorrelationId() }, 'export started');
```

## Background Jobs with `JobContextModule`

When a request enqueues a job (BullMQ, SQS, ...), the worker that runs it has none of the request's context. `JobContextModule` registers a tenant list, a principal resolver, and context sources with `@cqrs-ddd/pipeline-job-context`:

```typescript
import { Module } from '@nestjs/common';
import { JobContextModule } from '@cqrs-ddd/nestjs/job-context';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';
import { SessionJobPrincipal } from './session-job-principal.service.js';
import { AccountsModule } from './accounts/accounts.module.js';

@Module({
  imports: [
    JobContextModule.forRoot({
      imports: [AccountsModule],
      principal: SessionJobPrincipal,
      tenants: ['tenant_primary', 'tenant_secondary'],
      sources: {
        tenantId: tenantSource,
        correlationId: correlationSource,
      },
    }),
  ],
})
export class BackgroundJobModule {}
```

Enqueue jobs carrying context using `withJobContext`, and wrap processors with `@InJobContext()`:

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InJobContext, withJobContext } from '@cqrs-ddd/pipeline-job-context';
import { Job } from 'bullmq';

// When enqueuing:
await queue.add('process-statement', withJobContext({ accountId: 'acc_123' }));

// In processor:
@Processor('statements')
export class StatementProcessor extends WorkerHost {
  @InJobContext()
  async process(job: Job): Promise<void> {
    // Current tenant, principal, and correlation ID are active in AsyncLocalStorage
  }
}
```

## Domain-Driven Design Integration

`@cqrs-ddd/core` aggregates and domain events integrate cleanly with `@nestjs/cqrs`.

### `CommandBaseHandler` with NestJS `EventBus`

The NestJS `@nestjs/cqrs` `EventBus` implements `IDomainEventPublisher` (`publishAll(events, dispatcherContext)`). Command handlers extending `CommandBaseHandler` automatically publish uncommitted domain events recorded on returned aggregates:

```typescript
import { CommandHandler } from '@nestjs/cqrs';
import { EventBus } from '@nestjs/cqrs';
import { CommandBaseHandler } from '@cqrs-ddd/core/application';
import { OrdersRepository } from './orders.repository.js';
import { Order } from './order.aggregate.js';
import { SubmitOrderCommand } from './submit-order.command.js';

@CommandHandler(SubmitOrderCommand)
export class SubmitOrderHandler extends CommandBaseHandler<SubmitOrderCommand, Order> {
  constructor(
    private readonly orders: OrdersRepository,
    eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: SubmitOrderCommand): Promise<Order> {
    const order = await this.orders.findById(command.orderId);
    order.submit();
    await this.orders.save(order);
    return order; // execute() automatically dispatches order.getUncommittedEvents() via eventBus
  }
}
```

### Optimistic Concurrency and 409 Conflict

When using `@PersistedWrite()` on aggregate repositories, update collisions throw `ConcurrencyConflictError`. When dispatched via `commandBus.execute()`, `ErrorFilter` catches the error and responds with HTTP status 409 Conflict without requiring manual try/catch blocks in controllers or handlers.

## Complete Production Example

Below is an end-to-end user registration command handler in NestJS demonstrating validation, idempotency, audit logging, and domain event dispatch:

```typescript
// 1. Command and Schema
import { z } from 'zod';

export const RegisterUserSchema = z.object({
  email: z.email(),
  fullName: z.string().min(2),
});

export class RegisterUserCommand {
  constructor(
    readonly email: string,
    readonly fullName: string,
  ) {}
}

// 2. Command Handler
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { CommandBaseHandler } from '@cqrs-ddd/core/application';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { validated } from '@cqrs-ddd/pipeline-zod';
import { idempotent, createPartitionedIdempotencyKeyFactory } from '@cqrs-ddd/pipeline-idempotency';
import { audit } from '@cqrs-ddd/pipeline-audit';
import { User } from '../domain/user.aggregate.js';
import { UsersRepository } from '../persistence/users.repository.js';

const userKeyFactory = createPartitionedIdempotencyKeyFactory({
  principal: () => 'registration',
  operation: (ctx) => (ctx.request as RegisterUserCommand).email,
});

@CommandHandler(RegisterUserCommand)
@UsePipeline(
  validated(RegisterUserSchema),
  idempotent({ keyFactory: userKeyFactory, ttl: 86_400_000 }),
  audit({ action: 'user.registered' }),
)
export class RegisterUserHandler extends CommandBaseHandler<RegisterUserCommand, User> {
  constructor(
    private readonly users: UsersRepository,
    eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: RegisterUserCommand): Promise<User> {
    const user = User.register(command.email, command.fullName);
    await this.users.save(user);
    return user;
  }
}

// 3. Controller
import { Controller, Post, Body } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';

@Controller('users')
export class UsersController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('register')
  async register(@Body() body: RegisterUserCommand) {
    const user = await this.commandBus.execute(
      new RegisterUserCommand(body.email, body.fullName),
    );
    return { id: user.id, email: user.email };
  }
}
```

## Troubleshooting & Invariants

### Request-Scoped Handlers or Behaviors

If a handler or behavior is configured with `{ scope: Scope.REQUEST }`, application startup fails with:

```text
Error: CreateUserHandler runs pipeline behaviors but is request-scoped, itself or through a dependency;
Nest builds it per request, so its pipeline would never run. Make it a singleton and read request data from async context.
```

**Resolution**: Ensure all handlers, behaviors, and their injected dependencies are singletons (`Scope.DEFAULT`). Read tenant IDs, user identities, or tokens from `AsyncLocalStorage` via pipeline `sources`.

### Missing Behavior Provider

If a handler declares a behavior via `@UsePipeline(MyBehavior)` or a tuple, but no module registers a provider for `MyBehavior`:

```text
Error: MyBehavior runs in the pipeline of CreateUserHandler, but no module provides it.
Register it as a provider of the module that configures it.
```

**Resolution**: Add `{ provide: MyBehavior, useClass: MyBehavior }` (or `useFactory`) to the providers and exports of the module managing that concern.

### Duplicate Behavior Providers

If multiple modules provide the same behavior class token:

```text
Error: LoggingBehavior is provided by AppModule and LoggingModule; exactly one module provides each behavior,
otherwise which instance a handler gets would depend on import order.
```

**Resolution**: Provide the behavior once in a dedicated shared module and export it.

## API Reference

- [`PipelineModule`](/ddd-cqrs/api/cqrs-ddd/nestjs/main/classes/pipelinemodule/)
- [`PipelineBootstrap`](/ddd-cqrs/api/cqrs-ddd/nestjs/main/classes/pipelinebootstrap/)
- [`ErrorFilter`](/ddd-cqrs/api/cqrs-ddd/nestjs/main/classes/errorfilter/)
- [`httpAnswer`](/ddd-cqrs/api/cqrs-ddd/nestjs/main/functions/httpanswer/)
- [`toHttpException`](/ddd-cqrs/api/cqrs-ddd/nestjs/main/functions/tohttpexception/)
- [`CorrelationMiddleware`](/ddd-cqrs/api/cqrs-ddd/nestjs/correlation/classes/correlationmiddleware/)
- [`JobContextModule`](/ddd-cqrs/api/cqrs-ddd/nestjs/job-context/classes/jobcontextmodule/)
