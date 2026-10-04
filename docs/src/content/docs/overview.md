---
title: Overview
description: What the @cqrs-ddd packages are and how they fit together.
---

The `@cqrs-ddd` packages are TypeScript building blocks designed to operate without framework lock-in. They fall into two independent core families (the pipeline and DDD primitives), complemented by two application runtimes: framework-free `@cqrs-ddd/cqrs` and the official NestJS adapter `@cqrs-ddd/nestjs`.

## The pipeline family

[`@cqrs-ddd/pipeline`](/ddd-cqrs/packages/pipeline/) is the central execution engine: `createPipeline()` configures behaviors once, and `pipeline.wrap()` runs them around a plain function or a class method. A behavior is an object with one method, `handle(context, next)`, allowing it to act before the call, after it, or instead of it.

Each `@cqrs-ddd/pipeline-<name>` package provides one specialized concern as a behavior:

| Concern | Package |
| --- | --- |
| Logging | [`@cqrs-ddd/pipeline`](/ddd-cqrs/packages/pipeline/) (`LoggingBehavior`, `logging()`) |
| Validation | [`@cqrs-ddd/pipeline-zod`](/ddd-cqrs/packages/pipeline-zod/) |
| Authorization | [`@cqrs-ddd/pipeline-casl`](/ddd-cqrs/packages/pipeline-casl/) |
| Caching | [`@cqrs-ddd/pipeline-cache`](/ddd-cqrs/packages/pipeline-cache/) |
| Idempotency | [`@cqrs-ddd/pipeline-idempotency`](/ddd-cqrs/packages/pipeline-idempotency/) |
| Rate limits | [`@cqrs-ddd/pipeline-rate-limit`](/ddd-cqrs/packages/pipeline-rate-limit/) |
| Retry, timeout, bulkhead | [`@cqrs-ddd/pipeline-resilience`](/ddd-cqrs/packages/pipeline-resilience/) |
| Feature flags | [`@cqrs-ddd/pipeline-feature-flags`](/ddd-cqrs/packages/pipeline-feature-flags/) |
| Audit trail | [`@cqrs-ddd/pipeline-audit`](/ddd-cqrs/packages/pipeline-audit/) |
| Dead letters | [`@cqrs-ddd/pipeline-deadletter`](/ddd-cqrs/packages/pipeline-deadletter/) |
| Traces and metrics | [`@cqrs-ddd/pipeline-opentelemetry`](/ddd-cqrs/packages/pipeline-opentelemetry/) |
| Tenant, correlation id, job context | [`@cqrs-ddd/pipeline-tenant`](/ddd-cqrs/packages/pipeline-tenant/), [`@cqrs-ddd/pipeline-correlation`](/ddd-cqrs/packages/pipeline-correlation/), [`@cqrs-ddd/pipeline-job-context`](/ddd-cqrs/packages/pipeline-job-context/) |

A behavior is a plain class: its constructor takes whatever dependencies it requires (a cache, a store, a client) without relying on any dependency-injection container. Behaviors mapping errors to HTTP responses export `toHttpResponse(error)` from a separate `/http` entry point, usable with any HTTP framework.

## The DDD family

[`@cqrs-ddd/core`](/ddd-cqrs/packages/core/) provides aggregate roots, domain events, command and query base classes, repository contracts, and a revision-fenced repository cache; [`@cqrs-ddd/mikro-orm`](/ddd-cqrs/packages/mikro-orm/) adapts its repositories to MikroORM.

[`@cqrs-ddd/safe-stringify`](/ddd-cqrs/packages/safe-stringify/), [`@cqrs-ddd/untyped`](/ddd-cqrs/packages/untyped/), and [`@cqrs-ddd/uuidv7`](/ddd-cqrs/packages/uuidv7/) are small, zero-dependency utilities shared across both families.

## Application runtimes

Depending on your target architecture, two application runtimes run handlers through pipelines:

### 1. Framework-free CQRS (`@cqrs-ddd/cqrs`)

[`@cqrs-ddd/cqrs`](/ddd-cqrs/packages/cqrs/) runs commands, queries, and events without any framework:
- Uses `@CommandHandler`, `@QueryHandler`, and `@EventsHandler` on handler classes.
- Declares behaviors with `@UsePipeline` and `@SkipPipeline` from `@cqrs-ddd/pipeline`.
- `createCqrs()` instantiates `CommandBus`, `QueryBus`, `EventBus`, and `UnhandledExceptionBus`.
- No DI container: the application constructs handlers with `new` and registers them. See [CQRS without NestJS](/ddd-cqrs/guides/cqrs/). The repository's `api/` is a complete application built this way.

### 2. NestJS Adapter (`@cqrs-ddd/nestjs`)

[`@cqrs-ddd/nestjs`](/ddd-cqrs/packages/nestjs/) glues the packages into an existing NestJS application:
- Keeps official `@nestjs/cqrs` handlers, buses, and NestJS dependency injection.
- `PipelineModule.forRoot()` compiles `@cqrs-ddd/pipeline` behaviors around `@nestjs/cqrs` handlers at bootstrap.
- `ErrorFilter` maps all `@cqrs-ddd` errors to NestJS `HttpException` instances matching Nest's standard JSON response body.
- Provides `CorrelationMiddleware` and `JobContextModule` for tracing and worker queues. See [NestJS & @cqrs-ddd](/ddd-cqrs/guides/from-nestjs/) and the [`@cqrs-ddd/nestjs` package guide](/ddd-cqrs/packages/nestjs/).

## Using them together

Neither the pipeline nor the DDD family depends on the other. A `BaseCommand`, `BaseQuery`, or `DomainEvent` from `@cqrs-ddd/core` carries the `REQUEST_KIND` brand symbol that informs pipeline behaviors of its kind, allowing decorated handlers to run without explicit configuration: see [DDD without a framework](/ddd-cqrs/guides/ddd/).
