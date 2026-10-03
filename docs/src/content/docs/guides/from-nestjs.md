---
title: Coming from NestJS
description: What carries over from @nestjs/cqrs to @cqrs-ddd/cqrs, and what the application does itself.
sidebar:
  order: 4
---

[`@cqrs-ddd/cqrs`](/ddd-cqrs/packages/cqrs/) keeps the handler side of `@nestjs/cqrs`: the
same decorators and buses, with a pipeline of behaviors around each handler. It leaves out
NestJS's architecture: there are no modules, no container and no injection. The
application builds its handlers with `new` and registers them, in one place.

## What carries over

| `@nestjs/cqrs` | `@cqrs-ddd` |
| --- | --- |
| `@CommandHandler`, `@QueryHandler`, `@EventsHandler` | the same, from `@cqrs-ddd/cqrs` |
| `ICommandHandler`, `IQueryHandler`, `IEventHandler`, `Command<R>`, `Query<R>` | the same |
| `CommandBus`, `QueryBus`, `EventBus`, `EventPublisher`, `UnhandledExceptionBus` | the same, from `createCqrs()` |

## What the application does itself

| NestJS | `@cqrs-ddd` |
| --- | --- |
| `@Module`, `@Injectable`, `@Inject(TOKEN)`, providers | one composition function that builds everything with `new` |
| `NestFactory.create(AppModule)` | `createCqrs(options)` and `register(...handlers)` |
| lifecycle hooks, `app.close()` | `cqrs.close()`, then closing what the handlers use |
| controllers, guards, interceptors, pipes, filters | the HTTP framework's own routes and middleware; see [HTTP with Express and Fastify](/ddd-cqrs/guides/http/) |
| request-scoped providers | `AsyncLocalStorage`, as the tenant and the correlation id do |

## Differences in behavior

**Startup failures.** A second handler for one command or query fails `register()`, where
NestJS keeps the last one.

**A missing handler.** `CommandBus.execute()` rejects with
`CommandHandlerNotFoundException`, as `QueryBus.execute()` does; `@nestjs/cqrs` throws the
command error synchronously.

**Failed event handlers.** As in NestJS, a failure goes to the `UnhandledExceptionBus` and
is logged, or with `rethrowUnhandled` is thrown as an uncaught exception. Unlike NestJS,
the handler keeps receiving later events after a rethrown failure. `UnhandledExceptionBus`
has no rxjs: `subscribe(next)` returns a subscription with `unsubscribe()`, and there is
no `pipe` or `ofType`.

**Shutdown.** `close()` waits for the event handlers still running, so a test or a
shutdown ends after the work it caused.

**Not provided.** Sagas and `ofType`, `AsyncContext`, custom command, query and event
publishers.
