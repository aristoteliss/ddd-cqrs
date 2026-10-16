---
title: "From @nestjs-pipeline 0.4.x"
description: "Move a NestJS application from the @nestjs-pipeline 0.4.x packages to @cqrs-ddd 0.5.0: package names, the adapter, behavior providers and the error filter."
sidebar:
  order: 4.5
---

From 0.5.0 the `@nestjs-pipeline/*` packages continue as `@cqrs-ddd/*`. The 0.4.x line receives fixes only, and versions 0.1 to 0.4 stay on npm unchanged, so an application on 0.4.x keeps working without a change. This page lists what changes when it moves to 0.5.0. The requirements stay the same: Node.js 22.12 or later and NestJS 12.

Handlers do not change. `@CommandHandler`, `@QueryHandler` and `@EventsHandler` stay the ones of `@nestjs/cqrs`, and `@UsePipeline`, `@SkipPipeline` and the behaviors' helpers (`idempotent()`, `audit()`, `cache()`, `requires()`, `rateLimit()`, `featureFlag()`, `resilience()`, `deadLetter()`, `trace()`, `metrics()`) keep their names. What changes is the wiring in the modules.

## Package Names

| 0.4.x | 0.5.0 |
| --- | --- |
| `@nestjs-pipeline/core` | `@cqrs-ddd/pipeline`, and [`@cqrs-ddd/nestjs`](/ddd-cqrs/packages/nestjs/) for `PipelineModule` |
| `@nestjs-pipeline/<name>` | `@cqrs-ddd/pipeline-<name>`, for `audit`, `cache`, `casl`, `correlation`, `deadletter`, `feature-flags`, `idempotency`, `job-context`, `opentelemetry`, `rate-limit`, `resilience`, `tenant` and `zod` |

`@cqrs-ddd/nestjs` is the NestJS adapter: `PipelineModule`, `ErrorFilter`, and the `/correlation` and `/job-context` entry points. `@nestjs-pipeline/cqrs-ddd` 0.5.0 is a facade that re-exports it from the same three entry points. A NestJS application keeps the buses of `@nestjs/cqrs`; `@cqrs-ddd/cqrs` is for an application without NestJS (see [NestJS & @cqrs-ddd](/ddd-cqrs/guides/from-nestjs/)).

```bash
pnpm remove @nestjs-pipeline/core @nestjs-pipeline/idempotency @nestjs-pipeline/audit
pnpm add @cqrs-ddd/nestjs @cqrs-ddd/pipeline @cqrs-ddd/core \
  @cqrs-ddd/pipeline-idempotency @cqrs-ddd/pipeline-audit
```

`@cqrs-ddd/core` is a required peer of the adapter.

## Behavior Modules Become Providers

In 0.4.x eight add-on packages had a NestJS module that built their behavior. In 0.5.0 the packages have no NestJS module: the application builds each behavior with `new`, with the same constructor arguments, and provides it under the behavior's class. `PipelineModule` takes the instances from the container.

The 0.4.x module:

```typescript
import { LoggingBehavior, PipelineModule } from '@nestjs-pipeline/core';
import { AuditModule } from '@nestjs-pipeline/audit';
import {
  IdempotencyConflictFilter,
  IdempotencyModule,
} from '@nestjs-pipeline/idempotency';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      behaviors: [LoggingBehavior],
      globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
    }),
    IdempotencyModule.forRoot(),
    AuditModule.forRoot(),
  ],
  providers: [
    { provide: APP_FILTER, useClass: IdempotencyConflictFilter },
    PayInvoiceHandler,
  ],
})
export class AppModule {}
```

The same module on 0.5.0:

```typescript
import { ErrorFilter, PipelineModule } from '@cqrs-ddd/nestjs';
import { LoggingBehavior } from '@cqrs-ddd/pipeline';
import { AuditBehavior, LogAuditSink } from '@cqrs-ddd/pipeline-audit';
import {
  IdempotencyBehavior,
  MemoryIdempotencyStore,
} from '@cqrs-ddd/pipeline-idempotency';
import { Logger, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
    }),
  ],
  providers: [
    { provide: APP_FILTER, useClass: ErrorFilter },
    {
      provide: LoggingBehavior,
      useFactory: () => new LoggingBehavior(new Logger('Pipeline')),
    },
    {
      provide: IdempotencyBehavior,
      useFactory: () => new IdempotencyBehavior(new MemoryIdempotencyStore()),
    },
    {
      provide: AuditBehavior,
      useFactory: () => new AuditBehavior(new LogAuditSink()),
    },
    PayInvoiceHandler,
  ],
})
export class AppModule {}
```

A store or sink that a 0.4.x module chose when none was given is now passed explicitly: `MemoryIdempotencyStore` for idempotency and `LogAuditSink` for audit. A behavior that a handler names and no module provides stops the application at startup, with a message that names the behavior, so a module missed in the move does not go unnoticed.

| 0.4.x module | 0.5.0 provider |
| --- | --- |
| `AuditModule.forRoot({ sink, defaults })` | `new AuditBehavior(sink, defaults)` |
| `CacheModule.forRoot({ store, ttl, defaults })` | `new CacheBehavior(buildCache({ store, ttl }), defaults)`; `buildCache()` takes the module's other options |
| `CaslModule.forRoot({ permissionSource })` | `new CaslBehavior(permissionSource)` |
| `DeadLetterModule.forRoot({ transport, defaults })` | `new DeadLetterBehavior(transport, defaults)` |
| `FeatureFlagsModule.forRoot({ provider, context, defaults })` | `new FeatureFlagBehavior(await createFeatureFlagClient({ provider }), defaults, context)` |
| `IdempotencyModule.forRoot({ store, defaults })` | `new IdempotencyBehavior(store, defaults)` |
| `RateLimitModule.forRoot({ limiter, defaults })` | `new RateLimitBehavior(limiter, defaults)` |
| `ResilienceModule.forRoot({ defaults, policies })` | `new ResilienceBehavior(defaults)`, and a provider of `new ResiliencePolicies(policies)` |
| `ZodValidationBehavior`, `TraceBehavior` and `AttributesBehavior` in `behaviors` | the class itself in `providers` |
| `MetricsBehavior` in `behaviors` | `new MetricsBehavior(logger)` |

The behaviors that log take an optional logger after their other arguments, and a NestJS `Logger` serves. The `forRootAsync()` variants become a `useFactory` with `inject`, as in [Registering Behaviors with Dependency Injection](/ddd-cqrs/packages/nestjs/#registering-behaviors-with-dependency-injection).

## `PipelineModule`

`PipelineModule` comes from `@cqrs-ddd/nestjs`. Its `forRoot()` takes `globalBehaviors`, `sources` and `diagnostics`, as in 0.4.x. It has no `forRootAsync()` or `forFeature()`, and no `behaviors`, `bootstrapLogLevel` or `loggerProvider` option: a behavior is a provider, and `LoggingBehavior` takes its logger in its constructor.

## Error Filters

The per-package filters `ZodValidationFilter`, `UnauthorizedActionFilter`, `FeatureDisabledFilter`, `RateLimitExceededFilter` and `IdempotencyConflictFilter` become one `ErrorFilter`, registered once as `APP_FILTER`. It answers the errors of those five packages, when installed, and the domain errors of `@cqrs-ddd/core`; [Error Translation Mapping](/ddd-cqrs/packages/nestjs/#error-translation-mapping) lists the statuses. Outside NestJS, the `/http` entry point of `pipeline-zod`, `pipeline-casl`, `pipeline-feature-flags`, `pipeline-rate-limit` and `pipeline-idempotency` exports `toHttpResponse` for the same mapping.

`zodBadRequest`, the `exceptionFactory` for NestJS's `StandardSchemaValidationPipe`, is not part of 0.5.0.

## Correlation and Job Context

- `HttpCorrelationMiddleware` of `@nestjs-pipeline/correlation` is `CorrelationMiddleware` of `@cqrs-ddd/nestjs/correlation`. It reads the `x-correlation-id` header; for other options, build a middleware from `httpCorrelation(options)` of `@cqrs-ddd/pipeline-correlation`. See [Correlation ID Middleware](/ddd-cqrs/packages/nestjs/#correlation-id-middleware).
- `JobContextModule` comes from `@cqrs-ddd/nestjs/job-context`, with the same options. `withJobContext`, `@InJobContext` and `@AsSystem` stay in `@cqrs-ddd/pipeline-job-context`.

## Injection Tokens and Metadata Keys

The injection tokens of the 0.4.x modules are not exported in 0.5.0: `AUDIT_SINK`, `PIPELINE_CACHE`, `CASL_PERMISSION_SOURCE`, `DEAD_LETTER_TRANSPORT`, `FEATURE_FLAGS_CLIENT`, `IDEMPOTENCY_STORE`, `RATE_LIMITER`, `CORRELATION_OPTIONS`, `LOGGING_BEHAVIOR_LOGGER`, the other `FEATURE_FLAGS_*` tokens, and the `*_DEFAULT_OPTIONS` tokens. An application that injected one defines its own token and provides the value under it. `@InjectResiliencePolicy(name)` and `getResiliencePolicyToken(name)` become an injected `ResiliencePolicies` and `policies.execute(name, fn)`, as in [Outbound Dependency Policies](/ddd-cqrs/packages/pipeline-resilience/#outbound-dependency-policies-resiliencepolicies).

The metadata keys `PIPELINE_BEHAVIORS_METADATA`, `PIPELINE_BEHAVIORS_OPTIONS_METADATA` and `PIPELINE_SKIPPED_BEHAVIORS_METADATA` are not exported either; `pipelineOf(handler)` of `@cqrs-ddd/pipeline` reads a handler's declaration.

## The 0.4.x Line

The `@nestjs-pipeline/*` packages are not deprecated and are not removed from npm. Their documentation stays at [aristoteliss.github.io/nestjs-pipeline](https://aristoteliss.github.io/nestjs-pipeline/), and the [nestjs-pipeline](https://github.com/aristoteliss/nestjs-pipeline) repository holds `api/`, a complete NestJS application on the 0.5.0 packages.
