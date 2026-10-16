---
title: "Από το @nestjs-pipeline 0.4.x"
description: "Μεταφορά μιας εφαρμογής NestJS από τα πακέτα @nestjs-pipeline 0.4.x στο @cqrs-ddd 0.5.0: ονόματα πακέτων, ο adapter, behaviors ως providers και το error filter."
sidebar:
  order: 4.5
---

Από την 0.5.0 τα πακέτα `@nestjs-pipeline/*` συνεχίζουν ως `@cqrs-ddd/*`. Η σειρά 0.4.x δέχεται μόνο διορθώσεις, και οι εκδόσεις 0.1 έως 0.4 παραμένουν αμετάβλητες στο npm, οπότε μια εφαρμογή σε 0.4.x συνεχίζει να λειτουργεί χωρίς αλλαγή. Η σελίδα αυτή απαριθμεί τι αλλάζει όταν μεταφέρεται στην 0.5.0. Οι απαιτήσεις μένουν ίδιες: Node.js 22.12 ή νεότερο και NestJS 12.

Οι handlers δεν αλλάζουν. Τα `@CommandHandler`, `@QueryHandler` και `@EventsHandler` παραμένουν αυτά του `@nestjs/cqrs`, και τα `@UsePipeline`, `@SkipPipeline` και οι βοηθητικές συναρτήσεις των behaviors (`idempotent()`, `audit()`, `cache()`, `requires()`, `rateLimit()`, `featureFlag()`, `resilience()`, `deadLetter()`, `trace()`, `metrics()`) διατηρούν τα ονόματά τους. Αλλάζει η σύνδεση στα modules.

## Ονόματα πακέτων

| 0.4.x | 0.5.0 |
| --- | --- |
| `@nestjs-pipeline/core` | `@cqrs-ddd/pipeline`, και [`@cqrs-ddd/nestjs`](/ddd-cqrs/el/packages/nestjs/) για το `PipelineModule` |
| `@nestjs-pipeline/<name>` | `@cqrs-ddd/pipeline-<name>`, για τα `audit`, `cache`, `casl`, `correlation`, `deadletter`, `feature-flags`, `idempotency`, `job-context`, `opentelemetry`, `rate-limit`, `resilience`, `tenant` και `zod` |

Το `@cqrs-ddd/nestjs` είναι ο adapter για το NestJS: `PipelineModule`, `ErrorFilter`, και τα entry points `/correlation` και `/job-context`. Το `@nestjs-pipeline/cqrs-ddd` 0.5.0 είναι ένα facade που τον επανεξάγει από τα ίδια τρία entry points. Μια εφαρμογή NestJS διατηρεί τα buses του `@nestjs/cqrs`· το `@cqrs-ddd/cqrs` προορίζεται για εφαρμογή χωρίς NestJS (δείτε [NestJS & @cqrs-ddd](/ddd-cqrs/el/guides/from-nestjs/)).

```bash
pnpm remove @nestjs-pipeline/core @nestjs-pipeline/idempotency @nestjs-pipeline/audit
pnpm add @cqrs-ddd/nestjs @cqrs-ddd/pipeline @cqrs-ddd/core \
  @cqrs-ddd/pipeline-idempotency @cqrs-ddd/pipeline-audit
```

Το `@cqrs-ddd/core` είναι υποχρεωτικό peer του adapter.

## Τα modules των behaviors γίνονται providers

Στην 0.4.x οκτώ πρόσθετα πακέτα είχαν ένα module NestJS που κατασκεύαζε το behavior τους. Στην 0.5.0 τα πακέτα δεν έχουν module NestJS: η εφαρμογή κατασκευάζει κάθε behavior με `new`, με τα ίδια ορίσματα constructor, και το παρέχει με token την κλάση του behavior. Το `PipelineModule` παίρνει τα instances από το container.

Το module στην 0.4.x:

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

Το ίδιο module στην 0.5.0:

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

Ένα store ή sink που ένα module της 0.4.x επέλεγε όταν δεν δινόταν κανένα περνά πλέον ρητά: `MemoryIdempotencyStore` για το idempotency και `LogAuditSink` για το audit. Ένα behavior που ένας handler ονομάζει και κανένα module δεν παρέχει σταματά την εφαρμογή κατά την εκκίνηση, με μήνυμα που ονομάζει το behavior, οπότε ένα module που ξεχάστηκε στη μεταφορά δεν περνά απαρατήρητο.

| Module στην 0.4.x | Provider στην 0.5.0 |
| --- | --- |
| `AuditModule.forRoot({ sink, defaults })` | `new AuditBehavior(sink, defaults)` |
| `CacheModule.forRoot({ store, ttl, defaults })` | `new CacheBehavior(buildCache({ store, ttl }), defaults)`· το `buildCache()` δέχεται τις υπόλοιπες επιλογές του module |
| `CaslModule.forRoot({ permissionSource })` | `new CaslBehavior(permissionSource)` |
| `DeadLetterModule.forRoot({ transport, defaults })` | `new DeadLetterBehavior(transport, defaults)` |
| `FeatureFlagsModule.forRoot({ provider, context, defaults })` | `new FeatureFlagBehavior(await createFeatureFlagClient({ provider }), defaults, context)` |
| `IdempotencyModule.forRoot({ store, defaults })` | `new IdempotencyBehavior(store, defaults)` |
| `RateLimitModule.forRoot({ limiter, defaults })` | `new RateLimitBehavior(limiter, defaults)` |
| `ResilienceModule.forRoot({ defaults, policies })` | `new ResilienceBehavior(defaults)`, και ένας provider του `new ResiliencePolicies(policies)` |
| `ZodValidationBehavior`, `TraceBehavior` και `AttributesBehavior` στο `behaviors` | η ίδια η κλάση στα `providers` |
| `MetricsBehavior` στο `behaviors` | `new MetricsBehavior(logger)` |

Τα behaviors που γράφουν log δέχονται έναν προαιρετικό logger μετά τα υπόλοιπα ορίσματά τους, και ένας `Logger` του NestJS αρκεί. Οι παραλλαγές `forRootAsync()` γίνονται `useFactory` με `inject`, όπως στην [Καταχώριση Behaviors με Dependency Injection](/ddd-cqrs/el/packages/nestjs/#καταχώριση-behaviors-με-dependency-injection).

## `PipelineModule`

Το `PipelineModule` προέρχεται από το `@cqrs-ddd/nestjs`. Το `forRoot()` του δέχεται `globalBehaviors`, `sources` και `diagnostics`, όπως στην 0.4.x. Δεν έχει `forRootAsync()` ή `forFeature()`, ούτε τις επιλογές `behaviors`, `bootstrapLogLevel` ή `loggerProvider`: ένα behavior είναι provider, και το `LoggingBehavior` δέχεται τον logger του στον constructor.

## Error filters

Τα filters ανά πακέτο `ZodValidationFilter`, `UnauthorizedActionFilter`, `FeatureDisabledFilter`, `RateLimitExceededFilter` και `IdempotencyConflictFilter` γίνονται ένα `ErrorFilter`, που καταχωρίζεται μία φορά ως `APP_FILTER`. Απαντά στα σφάλματα αυτών των πέντε πακέτων, όταν είναι εγκατεστημένα, και στα domain errors του `@cqrs-ddd/core`· ο [Πίνακας αντιστοίχισης σφαλμάτων](/ddd-cqrs/el/packages/nestjs/#πίνακας-αντιστοίχισης-σφαλμάτων) δίνει τα status. Εκτός NestJS, το entry point `/http` των `pipeline-zod`, `pipeline-casl`, `pipeline-feature-flags`, `pipeline-rate-limit` και `pipeline-idempotency` εξάγει το `toHttpResponse` για την ίδια αντιστοίχιση.

Το `zodBadRequest`, το `exceptionFactory` για το `StandardSchemaValidationPipe` του NestJS, δεν περιλαμβάνεται στην 0.5.0.

## Correlation και job context

- Το `HttpCorrelationMiddleware` του `@nestjs-pipeline/correlation` είναι το `CorrelationMiddleware` του `@cqrs-ddd/nestjs/correlation`. Διαβάζει το header `x-correlation-id`· για άλλες επιλογές, φτιάξτε ένα middleware από το `httpCorrelation(options)` του `@cqrs-ddd/pipeline-correlation`. Δείτε [Middleware για Correlation ID](/ddd-cqrs/el/packages/nestjs/#middleware-για-correlation-id).
- Το `JobContextModule` προέρχεται από το `@cqrs-ddd/nestjs/job-context`, με τις ίδιες επιλογές. Τα `withJobContext`, `@InJobContext` και `@AsSystem` παραμένουν στο `@cqrs-ddd/pipeline-job-context`.

## Injection tokens και metadata keys

Τα injection tokens των modules της 0.4.x δεν εξάγονται στην 0.5.0: `AUDIT_SINK`, `PIPELINE_CACHE`, `CASL_PERMISSION_SOURCE`, `DEAD_LETTER_TRANSPORT`, `FEATURE_FLAGS_CLIENT`, `IDEMPOTENCY_STORE`, `RATE_LIMITER`, `CORRELATION_OPTIONS`, `LOGGING_BEHAVIOR_LOGGER`, τα υπόλοιπα tokens `FEATURE_FLAGS_*`, και τα tokens `*_DEFAULT_OPTIONS`. Μια εφαρμογή που έκανε inject κάποιο από αυτά ορίζει δικό της token και παρέχει την τιμή με αυτό. Τα `@InjectResiliencePolicy(name)` και `getResiliencePolicyToken(name)` γίνονται ένα injected `ResiliencePolicies` και `policies.execute(name, fn)`, όπως στις [Πολιτικές εξωτερικών εξαρτήσεων](/ddd-cqrs/el/packages/pipeline-resilience/#πολιτικές-εξωτερικών-εξαρτήσεων-resiliencepolicies).

Ούτε τα metadata keys `PIPELINE_BEHAVIORS_METADATA`, `PIPELINE_BEHAVIORS_OPTIONS_METADATA` και `PIPELINE_SKIPPED_BEHAVIORS_METADATA` εξάγονται· το `pipelineOf(handler)` του `@cqrs-ddd/pipeline` διαβάζει τη δήλωση ενός handler.

## Η σειρά 0.4.x

Τα πακέτα `@nestjs-pipeline/*` δεν είναι deprecated και δεν αφαιρούνται από το npm. Η τεκμηρίωσή τους παραμένει στο [aristoteliss.github.io/nestjs-pipeline](https://aristoteliss.github.io/nestjs-pipeline/), και το repository [nestjs-pipeline](https://github.com/aristoteliss/nestjs-pipeline) περιέχει το `api/`, μια πλήρη εφαρμογή NestJS στα πακέτα της 0.5.0.
