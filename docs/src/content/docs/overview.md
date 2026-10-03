---
title: Overview
description: What the @cqrs-ddd packages are, how they fit together and how they relate to nestjs-pipeline.
---

The `@cqrs-ddd` packages are TypeScript building blocks that depend on no framework. They
fall into two independent families, the pipeline and DDD, and an application runtime
built on the pipeline.

## The pipeline family

[`@cqrs-ddd/pipeline`](/ddd-cqrs/packages/pipeline/) is a small engine: `createPipeline()`
configures behaviors once, and `pipeline.wrap()` runs them around a plain function or a
class method. A behavior is an object with one method, `handle(context, next)`, so it can
act before the call, after it, or instead of it.

Each `@cqrs-ddd/pipeline-<name>` package provides one concern as a behavior:

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

A behavior is a plain class: its constructor takes what it needs (a cache, a store, a
client) and checks it, so there is no dependency-injection container. Behaviors that map
their errors to HTTP answers do it in a separate `/http` entry point with
`toHttpResponse(error)`, which works with any HTTP framework.

## The DDD family

[`@cqrs-ddd/core`](/ddd-cqrs/packages/core/) provides aggregates, domain events, command
and query base classes, repository contracts and a repository cache;
[`@cqrs-ddd/mikro-orm`](/ddd-cqrs/packages/mikro-orm/) adapts its repositories to
MikroORM. [`@cqrs-ddd/safe-stringify`](/ddd-cqrs/packages/safe-stringify/),
[`@cqrs-ddd/untyped`](/ddd-cqrs/packages/untyped/) and
[`@cqrs-ddd/uuidv7`](/ddd-cqrs/packages/uuidv7/) are small utilities that both families
use.

## The application runtime

[`@cqrs-ddd/cqrs`](/ddd-cqrs/packages/cqrs/) runs commands, queries and events through
their handlers and a pipeline per handler: `@CommandHandler`, `@QueryHandler` and
`@EventsHandler` mark the handlers, `@UsePipeline` declares their behaviors, and
`createCqrs()` builds the buses. There is no container: the application builds its
handlers with `new` and registers them. See [CQRS without NestJS](/ddd-cqrs/guides/cqrs/);
the repository's `api/` is a complete application built this way.

## Using them together

Neither family depends on the other. A `BaseCommand`, `BaseQuery` or `DomainEvent` of
`@cqrs-ddd/core` carries a well-known symbol that tells a pipeline its kind, so a
decorated handler method needs no options: see
[DDD without a framework](/ddd-cqrs/guides/ddd/).

## In NestJS

The [nestjs-pipeline](https://aristoteliss.github.io/nestjs-pipeline/) packages run these
same behaviors in NestJS CQRS applications: they discover handlers, register behaviors in
the NestJS container, and read `@UsePipeline` declarations. A behavior is written once,
here, and serves both.
