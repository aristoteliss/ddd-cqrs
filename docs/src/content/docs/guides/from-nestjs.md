---
title: "NestJS & @cqrs-ddd: Integrating or Migrating"
description: "How to use @cqrs-ddd with NestJS via @cqrs-ddd/nestjs, or migrate from @nestjs/cqrs to framework-free @cqrs-ddd/cqrs."
sidebar:
  order: 4
---

Teams using NestJS have two architectural choices when adopting `@cqrs-ddd`:

1. **Keep NestJS and enhance it** with [`@cqrs-ddd/nestjs`](/ddd-cqrs/packages/nestjs/): Keep your existing `@nestjs/cqrs` handlers, modules, dependency injection, and controllers. The adapter wraps handlers in behavior pipelines, provides global exception filtering, and manages correlation and job context.
2. **Replace NestJS completely** with [`@cqrs-ddd/cqrs`](/ddd-cqrs/packages/cqrs/): Build framework-free applications on plain Node.js, Fastify, or Express, constructing handlers with `new` and registering them on `createCqrs()`.

## Architectural Comparison

| Dimension | Raw `@nestjs/cqrs` | NestJS + `@cqrs-ddd/nestjs` | Framework-Free `@cqrs-ddd/cqrs` |
| --- | --- | --- | --- |
| **Handler Decorators** | `@CommandHandler`, `@QueryHandler`, `@EventsHandler` | Same `@nestjs/cqrs` decorators + `@UsePipeline`, `@SkipPipeline` | Same names, from `@cqrs-ddd/cqrs` + `@UsePipeline`, `@SkipPipeline` |
| **Buses** | `CommandBus`, `QueryBus`, `EventBus` | Same `@nestjs/cqrs` buses | Same bus names, from `createCqrs()` |
| **Pipeline Behaviors** | None (requires Nest interceptors) | Compiles and executes `@cqrs-ddd/pipeline` around handlers | Compiles and executes `@cqrs-ddd/pipeline` around handlers |
| **DI & Containers** | NestJS IoC container | NestJS IoC container injects behaviors and handlers | No container: explicit `new` in composition root |
| **Exception Handling** | Manual exception filters | Automatic `ErrorFilter` mapping package errors to `HttpException` | Framework-neutral: HTTP layer maps errors (e.g. `domainErrorHttpStatus`) |
| **Startup Diagnostics** | Silent overrides on duplicates | Validates singleton scope, provider uniqueness, behavior contracts | Fails on duplicate handlers, missing decorators, contract violations |
| **Runtime** | NestJS | NestJS | No framework: the buses and the pipelines only |

---

## Option 1: Integrating with NestJS via `@cqrs-ddd/nestjs`

If you are already running on NestJS or want Nest's dependency injection and controller ecosystem, install `@cqrs-ddd/nestjs`.

```bash
pnpm add @cqrs-ddd/nestjs @cqrs-ddd/pipeline @cqrs-ddd/core @nestjs/cqrs
```

### What You Keep

- All `@Module()`, `@Injectable()`, `@Controller()` definitions.
- Official `@nestjs/cqrs` imports: `CqrsModule`, `CommandBus`, `QueryBus`, `EventBus`, `@CommandHandler`, `@QueryHandler`, `@EventsHandler`.
- Handlers implement `ICommandHandler`, `IQueryHandler`, `IEventHandler`.
- Controllers inject `CommandBus` and `QueryBus` as usual.

### What You Add

1. **`PipelineModule.forRoot()`** in `AppModule`:
   ```typescript
   @Module({
     imports: [
       CqrsModule.forRoot(),
       PipelineModule.forRoot({
         sources: { tenantId: tenantSource, correlationId: correlationSource },
         globalBehaviors: [{ scope: 'all', before: [logging()] }],
       }),
     ],
     providers: [
       { provide: APP_FILTER, useClass: ErrorFilter },
       { provide: LoggingBehavior, useFactory: () => new LoggingBehavior(new Logger('Pipeline')) },
     ],
   })
   export class AppModule {}
   ```

2. **Pipeline declarations on handlers**:
   ```typescript
   import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
   import { UsePipeline, SkipPipeline } from '@cqrs-ddd/pipeline';
   import { idempotent } from '@cqrs-ddd/pipeline-idempotency';
   import { validated } from '@cqrs-ddd/pipeline-zod';

   @CommandHandler(CreateInvoiceCommand)
   @UsePipeline(validated(CreateInvoiceSchema), idempotent({ keyFactory }))
   export class CreateInvoiceHandler implements ICommandHandler<CreateInvoiceCommand> {
     async execute(command: CreateInvoiceCommand) {
       // Executed inside the pipeline
     }
   }
   ```

3. **Domain Event publication**:
   Subclass `CommandBaseHandler` from `@cqrs-ddd/core/application` and pass the injected `@nestjs/cqrs` `EventBus`. When `handle(command)` returns an `AggregateRoot`, uncommitted domain events are automatically published through `eventBus.publishAll()` and uncommitted.

---

## Option 2: Migrating off NestJS to `@cqrs-ddd/cqrs`

If your goal is to drop NestJS for a lightweight, framework-free architecture (Express, Fastify, AWS Lambda, Cloudflare Workers), use `@cqrs-ddd/cqrs`.

```bash
pnpm add @cqrs-ddd/cqrs @cqrs-ddd/pipeline @cqrs-ddd/core
```

### What Carries Over

The core CQRS API matches `@nestjs/cqrs`:

| `@nestjs/cqrs` | `@cqrs-ddd/cqrs` |
| --- | --- |
| `@CommandHandler(Command)` | `@CommandHandler(Command)` from `@cqrs-ddd/cqrs` |
| `@QueryHandler(Query)` | `@QueryHandler(Query)` from `@cqrs-ddd/cqrs` |
| `@EventsHandler(...Events)` | `@EventsHandler(...Events)` from `@cqrs-ddd/cqrs` |
| `ICommandHandler<TCommand>` | `ICommandHandler<TCommand>` from `@cqrs-ddd/cqrs` |
| `IQueryHandler<TQuery>` | `IQueryHandler<TQuery>` from `@cqrs-ddd/cqrs` |
| `IEventHandler<TEvent>` | `IEventHandler<TEvent>` from `@cqrs-ddd/cqrs` |
| `CommandBus`, `QueryBus`, `EventBus` | Returned by `createCqrs()` |

### What the Application Does Itself

| NestJS Responsibility | `@cqrs-ddd` Equivalent |
| --- | --- |
| `@Module()`, `@Injectable()`, providers | A plain composition function that constructs dependencies with `new` |
| `NestFactory.create(AppModule)` | `const cqrs = createCqrs(options); cqrs.register(...handlers);` |
| Application shutdown hooks | `await cqrs.close()`, then closing database pools and redis connections |
| Controllers, guards, interceptors, pipes | Native HTTP routes and middleware; see [HTTP with Express and Fastify](/ddd-cqrs/guides/http/) |
| Request-scoped providers (`Scope.REQUEST`) | `AsyncLocalStorage` via context sources (`tenantId`, `correlationId`) |

### Complete Plain Node.js Example

```typescript
import {
  CommandHandler,
  createCqrs,
  type ICommandHandler,
} from '@cqrs-ddd/cqrs';
import { UsePipeline, LoggingBehavior } from '@cqrs-ddd/pipeline';
import { AuditBehavior, type AuditSink, audit } from '@cqrs-ddd/pipeline-audit';

class RegisterUserCommand {
  constructor(readonly email: string) {}
}

@CommandHandler(RegisterUserCommand)
@UsePipeline(audit({ action: 'user.registered' }))
class RegisterUserHandler implements ICommandHandler<RegisterUserCommand> {
  constructor(private readonly users: UsersRepository) {}

  async execute(command: RegisterUserCommand): Promise<string> {
    const user = await this.users.create(command.email);
    return user.id;
  }
}

// Composition Root
export function buildApplication(users: UsersRepository, auditSink: AuditSink) {
  const cqrs = createCqrs({
    behaviors: [new AuditBehavior(auditSink)],
    globalBehaviors: { before: [LoggingBehavior] },
  });

  cqrs.register(new RegisterUserHandler(users));

  return cqrs;
}
```

### Differences in Runtime Behavior

- **Strict handler registration**: Registering a second handler for the same command or query fails immediately in `cqrs.register()`. NestJS silently overrides earlier handlers with the last one registered.
- **Async missing handler errors**: In `@cqrs-ddd/cqrs`, `commandBus.execute()` and `queryBus.execute()` reject asynchronously with `CommandHandlerNotFoundException` or `QueryHandlerNotFoundException`. `@nestjs/cqrs` throws synchronously.
- **Graceful shutdown**: `cqrs.close()` awaits all running asynchronous event handlers before resolving. In NestJS, `app.close()` does not track background event handler completion.
- **Event error isolation**: As in `@nestjs/cqrs`, an event handler's failure goes to the `UnhandledExceptionBus` and the handler keeps receiving later events; `@cqrs-ddd/cqrs` also logs it, or rethrows it with `rethrowUnhandled: true`.
- **Not included in `@cqrs-ddd/cqrs`**: Sagas, `ofType` RxJS pipes, `AsyncContext`, and `EventPublisher` merge mechanisms. Aggregates publish events through `CommandBaseHandler`.

## Choosing Between the Two

- Choose **Option 1 (`@cqrs-ddd/nestjs`)** when working in an existing NestJS codebase, using NestJS microservices or GraphQL, or relying heavily on Nest's controller ecosystem and DI modules.
- Choose **Option 2 (`@cqrs-ddd/cqrs`)** when building greenfield microservices, serverless functions, high-throughput APIs on Fastify, or applications where zero dependency-injection overhead and instant startup are required.
