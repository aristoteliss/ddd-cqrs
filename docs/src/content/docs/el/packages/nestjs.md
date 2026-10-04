---
title: "@cqrs-ddd/nestjs"
description: "NestJS adapter για τα πακέτα @cqrs-ddd: εκτελεί handlers του @nestjs/cqrs μέσω behavior pipelines, αντιστοιχίζει σφάλματα σε NestJS HttpExceptions, και συνδέει correlation και job context."
sidebar:
  order: 3
---

Ο επίσημος adapter του NestJS για τα πακέτα [`@cqrs-ddd`](https://github.com/aristoteliss/ddd-cqrs).

Μια εφαρμογή NestJS διατηρεί την ιδιωματική αρχιτεκτονική του NestJS: modules, dependency injection, controllers, και το επίσημο `@nestjs/cqrs` (`CqrsModule`, `CommandBus`, `QueryBus`, `EventBus`, `@CommandHandler`, `@QueryHandler`, `@EventsHandler`). Ο adapter παρέχει όσα λείπουν από το `@nestjs/cqrs`:

1. **Pipeline behaviors γύρω από handlers**: κάνει compile και εκτελεί τα behaviors του `@cqrs-ddd/pipeline` γύρω από κάθε instance command, query και event handler κατά το bootstrap της εφαρμογής.
2. **Τυποποιημένο exception filtering**: το `ErrorFilter` μετατρέπει κάθε σφάλμα του `@cqrs-ddd` (domain errors, validation failures, άρνηση εξουσιοδότησης, rate limits, διενέξεις idempotency, feature flags) σε NestJS `HttpException` με το τυπικό response body του NestJS και τις κατάλληλες HTTP επικεφαλίδες.
3. **Διάδοση correlation ID**: το `CorrelationMiddleware` εκτελεί κάθε αίτημα με το correlation id από την επικεφαλίδα `x-correlation-id` (ή ένα νέο UUIDv7) και το επιστρέφει στην απάντηση.
4. **Ασύγχρονο job context**: το `JobContextModule` διαδίδει tenants, correlation IDs και principals σε ουρές εργασίας (όπως BullMQ) και τα αποκαθιστά στους processors.
5. **Ενσωμάτωση κύκλου ζωής aggregate**: commands που επεκτείνουν το `CommandBaseHandler` δημοσιεύουν αυτόματα τα uncommitted domain events μέσω του NestJS `EventBus`.

Μια πλήρης λειτουργική εφαρμογή NestJS που παρουσιάζει όλα τα παραπάνω μοτίβα είναι διαθέσιμη στο [nestjs-pipeline `api/`](https://github.com/aristoteliss/nestjs-pipeline/tree/master/api).

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/nestjs @cqrs-ddd/pipeline @cqrs-ddd/core @nestjs/cqrs
```

### Peer Dependencies

- **Υποχρεωτικά peers**: `@nestjs/common`, `@nestjs/core` και `@nestjs/cqrs` 12, και `@cqrs-ddd/pipeline` και `@cqrs-ddd/core` 0.5. Το ίδιο το NestJS απαιτεί `reflect-metadata` και `rxjs`.
- **Προαιρετικά peers**, εγκαθίστανται όταν τα χρησιμοποιεί η εφαρμογή:
  - `@cqrs-ddd/pipeline-zod`, `@cqrs-ddd/pipeline-casl`, `@cqrs-ddd/pipeline-feature-flags`, `@cqrs-ddd/pipeline-rate-limit` και `@cqrs-ddd/pipeline-idempotency`: το `ErrorFilter` μετατρέπει τα σφάλματα καθενός εξ αυτών αν είναι εγκατεστημένο.
  - `@cqrs-ddd/pipeline-correlation`, για το `@cqrs-ddd/nestjs/correlation`.
  - `@cqrs-ddd/pipeline-job-context`, για το `@cqrs-ddd/nestjs/job-context`.

Οποιοδήποτε άλλο πακέτο behavior (cache, resilience, audit, telemetry, dead letters) εκτελείται στα pipelines χωρίς να απαιτείται ειδική γνώση από τον adapter.

## Αρχιτεκτονικός κύκλος ζωής (Architectural Lifecycle)

Ο adapter λειτουργεί μέσω του `PipelineBootstrap`, μίας `@Injectable()` υπηρεσίας που καταχωρείται από το `PipelineModule`:

```text
Nest Application Bootstrap
  │
  ├─ 1. Εκτελείται το OnApplicationBootstrap lifecycle hook
  │
  ├─ 2. Το DiscoveryService σαρώνει όλους τους καταχωρημένους providers
  │
  ├─ 3. Εντοπίζει κλάσεις διακοσμημένες με @CommandHandler, @QueryHandler, @EventsHandler
  │
  ├─ 4. Διαβάζει τις δηλώσεις pipeline (@UsePipeline, @SkipPipeline) μέσω του pipelineOf()
  │
  ├─ 5. Κάνει compile το πλάνο εκτέλεσης (globalBehaviors + handler behaviors - skipped behaviors)
  │
  ├─ 6. Επιλύει τα instances των behaviors από το Nest DI container μέσω του class token
  │
  ├─ 7. Επικυρώνει τα static singleton scopes (αποτυγχάνει άμεσα αν handler ή behavior είναι request-scoped)
  │
  ├─ 8. Επικυρώνει τα behavior contracts (σειρά, απαιτούμενα items, διαγνωστικοί έλεγχοι)
  │
  └─ 9. Κάνει wrap τη μέθοδο του handler instance (execute για commands/queries, handle για events)
```

Βασικές εγγυήσεις runtime:
- **Instance wrapping, όχι μετάλλαξη prototype**: Μόνο τα provider instances της τρέχουσας εφαρμογής γίνονται wrap. Τα prototypes των κλάσεων δεν τροποποιούνται ποτέ, επιτρέποντας πολλαπλές απομονωμένες εφαρμογές στην ίδια διεργασία.
- **Fail-fast επικύρωση**: Ελλείποντες providers behaviors, αμφίσημοι διπλότυποι providers, request-scoped handlers ή σπασμένα contracts αποτυγχάνουν άμεσα κατά την εκκίνηση της εφαρμογής πριν ο HTTP listener αρχίσει να δέχεται κλήσεις.
- **Καθαρός τερματισμός**: Το `OnModuleDestroy` επαναφέρει τους αρχικούς method descriptors σε όλα τα wrapped handler instances.

## Ρύθμιση Pipeline

Εισάγετε το `PipelineModule.forRoot()` στο root module ή στο core infrastructure module της εφαρμογής σας:

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

| Επιλογή | Τύπος | Προεπιλογή | Περιγραφή |
| --- | --- | --- | --- |
| `globalBehaviors` | `GlobalBehaviorsOptions \| GlobalBehaviorsOptions[]` | κανένα | Behaviors τοποθετημένα γύρω από handlers στα επιλεγμένα scopes (`'all'`, `'commands'`, `'queries'`, `'events'`). |
| `sources` | `ContextSources` | κανένα | Από πού τα pipelines διαβάζουν και αποκαθιστούν τα `tenantId` και `correlationId`. |
| `diagnostics` | `'strict' \| 'warn' \| 'off'` | `'strict'` | Λειτουργία επικύρωσης των behavior contracts: το `'strict'` ρίχνει `PipelineConfigurationError` στην εκκίνηση, το `'warn'` καταγράφει προειδοποιήσεις, το `'off'` παρακάμπτει τους ελέγχους. |

## Καταχώριση Behaviors με Dependency Injection

Τα behaviors είναι απλές κλάσεις παραμετροποιημένες με εξαρτήσεις (loggers, Redis stores, connection pools, CASL loaders). Κάθε module παρέχει το instance του behavior υπό το class token του:

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

### Κανόνες Providers

1. **Απαιτείται singleton scope**: Κάθε behavior provider και κάθε handler που εκτελεί behaviors οφείλει να είναι στατικό singleton (`Scope.DEFAULT`). Αν ένας handler ή behavior είναι request-scoped (`Scope.REQUEST`), το `PipelineBootstrap` αποτυγχάνει άμεσα κατά την εκκίνηση. Δεδομένα αιτήματος πρέπει να ανακτώνται μέσω `AsyncLocalStorage` ή context sources.
2. **Μοναδικός provider ανά behavior**: Ακριβώς ένα module πρέπει να παρέχει κάθε class token ενός behavior. Αν δύο modules καταχωρίσουν providers για το ίδιο token, το `PipelineBootstrap` ρίχνει σφάλμα αναφέροντας και τα δύο modules προς αποφυγή ασάφειας.

## Handlers και δηλώσεις (Declarations)

Command, query και event handlers χρησιμοποιούν τους κλασικούς decorators του `@nestjs/cqrs`. Χρησιμοποιήστε τα `@UsePipeline` και `@SkipPipeline` από το `@cqrs-ddd/pipeline` για τη δήλωση behaviors:

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

### Ροή εκτέλεσης behaviors

Όταν ένας controller καλεί `commandBus.execute(command)`, η κλήση εισέρχεται στο compiled pipeline του `CreateOrderHandler`. Τα behaviors σχηματίζουν ομόκεντρα στρώματα: πρώτα τα global `before` behaviors (logging), έπειτα τα behaviors του ίδιου του handler κατά τη σειρά δήλωσης (authorization, validation, idempotency, audit), και τέλος τα global `after` behaviors. Η μέθοδος `execute(command)` του handler εκτελείται στο εσωτερικό με το επικυρωμένο command. Κατά την επιστροφή, κάθε behavior παραλαμβάνει το αποτέλεσμα ή το σφάλμα. Ένα behavior που ρίχνει σφάλμα (π.χ. απόρριψη authorization) διακόπτει την εκτέλεση πριν εκτελεστούν τα εσωτερικά στρώματα.

## Διαχείριση σφαλμάτων με το `ErrorFilter`

Το `ErrorFilter` αναχαιτίζει όλα τα σφάλματα του `@cqrs-ddd` και τα μεταφράζει σε τυποποιημένα NestJS `HttpException` instances που ταιριάζουν με το προεπιλεγμένο JSON error format του NestJS (`{ statusCode, message, error }`).

Καταχωρίστε το καθολικά (globally) στο `AppModule`:

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

### Πίνακας αντιστοίχισης σφαλμάτων

| Κλάση σφάλματος | Πακέτο προέλευσης | HTTP Status | Μορφή Response Body | Πρόσθετες επικεφαλίδες |
| --- | --- | --- | --- | --- |
| `ZodValidationError` | `@cqrs-ddd/pipeline-zod` | 400 Bad Request | `{ statusCode: 400, error: 'Bad Request', message: ['field: error message'] }` | — |
| `UnauthorizedActionException` | `@cqrs-ddd/pipeline-casl` | 403 Forbidden | `{ statusCode: 403, error: 'Forbidden', message, action, subject }` | — |
| `FeatureDisabledError` | `@cqrs-ddd/pipeline-feature-flags` | 403 Forbidden | `{ statusCode: 403, error: 'Forbidden', message, flag }` | — |
| `RateLimitExceededError` | `@cqrs-ddd/pipeline-rate-limit` | 429 Too Many Requests | `{ statusCode: 429, error: 'Too Many Requests', message, retryAfter }` | `Retry-After: <seconds>` |
| `IdempotencyConflictError` | `@cqrs-ddd/pipeline-idempotency` | 409 Conflict (`in_progress`, `replay_scope`) / 422 Unprocessable Entity (`key_reuse`) | `{ statusCode, error, message, idempotencyKey, reason }` | — |
| `EntityNotFoundException` | `@cqrs-ddd/core` | 404 Not Found | `{ statusCode: 404, error: 'Not Found', message: 'Order not found' }` | — |
| `ConcurrencyConflictError` | `@cqrs-ddd/core` (μέσω `@cqrs-ddd/mikro-orm`) | 409 Conflict | `{ statusCode: 409, error: 'Conflict', message }` | — |
| `MissingTenantContextError` | `@cqrs-ddd/core` | 500 Internal Server Error | `{ statusCode: 500, error: 'Internal Server Error', message: 'Internal server error' }` | — |
| οποιοδήποτε άλλο `DomainException` | `@cqrs-ddd/core` ή η εφαρμογή | 400 Bad Request | `{ statusCode: 400, error: 'Bad Request', message }` | — |

Μη αναγνωρίσιμα σφάλματα προωθούνται στην προεπιλεγμένη συμπεριφορά του `BaseExceptionFilter` του NestJS.

### Προσαρμοσμένα Exception Filters

Για να διαχειριστείτε ειδικά σφάλματα της εφαρμογής σας διατηρώντας παράλληλα τις μετατροπές του `@cqrs-ddd`, επεκτείνετε το `ErrorFilter` ή χρησιμοποιήστε τα `toHttpException` και `httpAnswer`:

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

## Middleware για Correlation ID

Το `CorrelationMiddleware` αντλεί το correlation id κάθε αιτήματος από την επικεφαλίδα `x-correlation-id` (ή παράγει ένα UUIDv7 αν απουσιάζει), εκτελεί το αίτημα εντός αυτού στο `AsyncLocalStorage`, και επιστρέφει την επικεφαλίδα στην απάντηση. Αποτελεί το `httpCorrelation()` του `@cqrs-ddd/pipeline-correlation` ως NestJS middleware και λειτουργεί σε Express και Fastify.

Καταχώριση στο `AppModule`:

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

## Background Jobs με το `JobContextModule`

Όταν ένα αίτημα εισάγει μια εργασία σε ουρά (BullMQ, SQS, κλπ.), ο worker που την εκτελεί δεν διαθέτει το αρχικό context του αιτήματος. Το `JobContextModule` καταχωρεί τη λίστα των tenants, τον principal resolver και τις πηγές context στο `@cqrs-ddd/pipeline-job-context`:

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

Εισαγωγή στην ουρά με `withJobContext`, και χρήση του `@InJobContext()` στους processors:

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InJobContext, withJobContext } from '@cqrs-ddd/pipeline-job-context';
import { Job } from 'bullmq';

// Κατά την εισαγωγή στην ουρά:
await queue.add('process-statement', withJobContext({ accountId: 'acc_123' }));

// Στον processor:
@Processor('statements')
export class StatementProcessor extends WorkerHost {
  @InJobContext()
  async process(job: Job): Promise<void> {
    // Το τρέχον tenant, principal και correlation ID είναι ενεργά στο AsyncLocalStorage
  }
}
```

## Ενσωμάτωση Domain-Driven Design

Τα aggregates και domain events του `@cqrs-ddd/core` ενσωματώνονται άψογα με το `@nestjs/cqrs`.

### `CommandBaseHandler` με το NestJS `EventBus`

Το `EventBus` του `@nestjs/cqrs` υλοποιεί το `IDomainEventPublisher` (`publishAll(events, dispatcherContext)`). Command handlers που επεκτείνουν το `CommandBaseHandler` δημοσιεύουν αυτόματα τα uncommitted domain events των aggregates:

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
    return order; // το execute() δημοσιεύει αυτόματα τα domain events μέσω του eventBus
  }
}
```

## Πλήρες παράδειγμα παραγωγής

Ακολουθεί ένας ολοκληρωμένος command handler εγγραφής χρήστη σε NestJS που συνδυάζει validation, idempotency, audit logging και δημοσίευση domain events:

```typescript
// 1. Command και Schema
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

## API Reference

- [`PipelineModule`](/ddd-cqrs/api/cqrs-ddd/nestjs/main/classes/pipelinemodule/)
- [`PipelineBootstrap`](/ddd-cqrs/api/cqrs-ddd/nestjs/main/classes/pipelinebootstrap/)
- [`ErrorFilter`](/ddd-cqrs/api/cqrs-ddd/nestjs/main/classes/errorfilter/)
- [`httpAnswer`](/ddd-cqrs/api/cqrs-ddd/nestjs/main/functions/httpanswer/)
- [`toHttpException`](/ddd-cqrs/api/cqrs-ddd/nestjs/main/functions/tohttpexception/)
- [`CorrelationMiddleware`](/ddd-cqrs/api/cqrs-ddd/nestjs/correlation/classes/correlationmiddleware/)
- [`JobContextModule`](/ddd-cqrs/api/cqrs-ddd/nestjs/job-context/classes/jobcontextmodule/)
