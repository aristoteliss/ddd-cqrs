---
title: "NestJS & @cqrs-ddd: Ενσωμάτωση ή Μετάβαση"
description: "Πώς να χρησιμοποιήσετε το @cqrs-ddd με το NestJS μέσω του @cqrs-ddd/nestjs, ή να μεταβείτε από το @nestjs/cqrs στο @cqrs-ddd/cqrs χωρίς framework."
sidebar:
  order: 4
---

Ομάδες που χρησιμοποιούν NestJS έχουν δύο αρχιτεκτονικές επιλογές όταν υιοθετούν το `@cqrs-ddd`:

1. **Διατήρηση του NestJS και προσθήκη του adapter** [`@cqrs-ddd/nestjs`](/ddd-cqrs/el/packages/nestjs/): Διατηρείτε τους υπάρχοντες handlers, τα buses, τα modules, το dependency injection και τους controllers του `@nestjs/cqrs`. Ο adapter τυλίγει τους handlers σε pipelines συμπεριφορών (behaviors), παρέχει κεντρικό exception filtering και διαχειρίζεται το correlation και το job context. Τίποτα δεν αντικαθίσταται.
2. **Μετάβαση σε CQRS χωρίς framework** με το [`@cqrs-ddd/cqrs`](/ddd-cqrs/el/packages/cqrs/): Δημιουργία εφαρμογών χωρίς NestJS σε απλό Node.js, Fastify ή Express, κατασκευάζοντας τους handlers με `new` και καταχωρίζοντάς τους στο `createCqrs()`. Καλύπτει handlers και buses, όχι κάθε δυνατότητα του `@nestjs/cqrs`: δείτε [Τι δεν περιλαμβάνεται](#τι-δεν-περιλαμβάνεται).

Οι δύο επιλογές είναι ανεξάρτητες. Μια υπάρχουσα εφαρμογή NestJS ακολουθεί την πρώτη και δεν χρειάζεται ποτέ τη δεύτερη. Μια εφαρμογή στα πακέτα `@nestjs-pipeline/*` 0.4.x ξεκινά από το [Από το @nestjs-pipeline 0.4.x](/ddd-cqrs/el/guides/from-nestjs-pipeline/).

## Σύγκριση Αρχιτεκτονικής

| Διάσταση | Καθαρό `@nestjs/cqrs` | NestJS + `@cqrs-ddd/nestjs` | `@cqrs-ddd/cqrs` χωρίς framework |
| --- | --- | --- | --- |
| **Handler Decorators** | `@CommandHandler`, `@QueryHandler`, `@EventsHandler` | Ίδιοι decorators του `@nestjs/cqrs` + `@UsePipeline`, `@SkipPipeline` | Ίδια ονόματα από το `@cqrs-ddd/cqrs` + `@UsePipeline`, `@SkipPipeline` |
| **Buses** | `CommandBus`, `QueryBus`, `EventBus` | Ίδια buses του `@nestjs/cqrs` | Ίδια ονόματα buses, από το `createCqrs()` |
| **Pipeline Behaviors** | Κανένα (απαιτούνται interceptors) | Μεταγλωττίζει και εκτελεί το `@cqrs-ddd/pipeline` γύρω από handlers | Μεταγλωττίζει και εκτελεί το `@cqrs-ddd/pipeline` γύρω από handlers |
| **DI & Containers** | IoC container του NestJS | IoC container του NestJS παρέχει behaviors και handlers | Χωρίς container: ρητή χρήση `new` στο composition root |
| **Exception Handling** | Χειροκίνητα exception filters | Αυτόματο `ErrorFilter` που μετατρέπει σφάλματα σε `HttpException` | Framework-neutral: το HTTP επίπεδο αντιστοιχίζει σφάλματα (`domainErrorHttpStatus`) |
| **Διαγνωστικοί έλεγχοι εκκίνησης** | Σιωπηρή επικάλυψη σε διπλότυπους handlers | Επαληθεύει singleton scope, μοναδικότητα providers, συμβόλαια behaviors | Αποτυγχάνει σε διπλότυπους handlers, ελλιπείς decorators, παραβιάσεις συμβολαίων |
| **Runtime** | NestJS | NestJS | Χωρίς framework: μόνο τα buses και τα pipelines |

---

## Επιλογή 1: Ενσωμάτωση στο NestJS μέσω του `@cqrs-ddd/nestjs`

Εάν εργάζεστε ήδη σε NestJS ή επιθυμείτε το οικοσύστημα controllers και dependency injection του Nest, εγκαταστήστε το `@cqrs-ddd/nestjs`:

```bash
pnpm add @cqrs-ddd/nestjs @cqrs-ddd/pipeline @cqrs-ddd/core @nestjs/cqrs
```

### Τι διατηρείτε

- Όλους τους ορισμούς `@Module()`, `@Injectable()`, `@Controller()`.
- Τα επίσημα imports του `@nestjs/cqrs`: `CqrsModule`, `CommandBus`, `QueryBus`, `EventBus`, `@CommandHandler`, `@QueryHandler`, `@EventsHandler`.
- Οι handlers υλοποιούν τα `ICommandHandler`, `IQueryHandler`, `IEventHandler`.
- Οι controllers κάνουν inject τα `CommandBus` και `QueryBus` όπως συνήθως.

### Τι προσθέτετε

Η [Ελάχιστη ρύθμιση](/ddd-cqrs/el/packages/nestjs/#ελάχιστη-ρύθμιση) είναι ένα πλήρες root module με κάθε import και provider, που εκτελείται από test. Τα παρακάτω βήματα δείχνουν τα μέρη του.

1. **`PipelineModule.forRoot()`** στο `AppModule`:
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

2. **Δηλώσεις pipeline σε handlers**:
   ```typescript
   import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
   import { UsePipeline, SkipPipeline } from '@cqrs-ddd/pipeline';
   import { idempotent } from '@cqrs-ddd/pipeline-idempotency';
   import { validated } from '@cqrs-ddd/pipeline-zod';

   @CommandHandler(CreateInvoiceCommand)
   @UsePipeline(validated(CreateInvoiceSchema), idempotent({ keyFactory }))
   export class CreateInvoiceHandler implements ICommandHandler<CreateInvoiceCommand> {
     async execute(command: CreateInvoiceCommand) {
       // Εκτελείται μέσα στο pipeline
     }
   }
   ```
   Κάθε behavior που αναφέρει ένας handler είναι provider κάποιου module: εδώ το `ZodValidationBehavior`, και το `IdempotencyBehavior` κατασκευασμένο με το store του.

3. **Δημοσίευση Domain Events**:
   Κληρονομήστε από τον `CommandBaseHandler` του `@cqrs-ddd/core/application` και περάστε το injected `EventBus` του `@nestjs/cqrs`. Όταν η `handle(command)` επιστρέφει ένα `AggregateRoot`, τα μη καταχωρισμένα domain events δημοσιεύονται αυτόματα μέσω του `eventBus.publishAll()` και καθαρίζονται. Η παράδοση παραμένει ό,τι παρέχει αυτό το `EventBus`: ο adapter δεν προσθέτει ανθεκτική παράδοση μηνυμάτων ούτε outbox.

---

## Επιλογή 2: Μετάβαση από το NestJS στο `@cqrs-ddd/cqrs`

Εάν ο στόχος σας είναι η κατάργηση του NestJS για μια αρχιτεκτονική χωρίς framework σε απλό Node.js, Express ή Fastify, χρησιμοποιήστε το `@cqrs-ddd/cqrs`:

```bash
pnpm add @cqrs-ddd/cqrs @cqrs-ddd/pipeline @cqrs-ddd/core
```

### Τι μεταφέρεται αυτούσιο

Οι decorators των handlers, τα interfaces των handlers και τα ονόματα των buses ταιριάζουν με το `@nestjs/cqrs`:

| `@nestjs/cqrs` | `@cqrs-ddd/cqrs` |
| --- | --- |
| `@CommandHandler(Command)` | `@CommandHandler(Command)` από το `@cqrs-ddd/cqrs` |
| `@QueryHandler(Query)` | `@QueryHandler(Query)` από το `@cqrs-ddd/cqrs` |
| `@EventsHandler(...Events)` | `@EventsHandler(...Events)` από το `@cqrs-ddd/cqrs` |
| `ICommandHandler<TCommand>` | `ICommandHandler<TCommand>` από το `@cqrs-ddd/cqrs` |
| `IQueryHandler<TQuery>` | `IQueryHandler<TQuery>` από το `@cqrs-ddd/cqrs` |
| `IEventHandler<TEvent>` | `IEventHandler<TEvent>` από το `@cqrs-ddd/cqrs` |
| `CommandBus`, `QueryBus`, `EventBus` | Επιστρέφονται από το `createCqrs()` |

### Τι δεν περιλαμβάνεται

Το `@cqrs-ddd/cqrs` δεν αντικαθιστά κάθε δυνατότητα του `@nestjs/cqrs`. Δεν έχει sagas, RxJS pipes με `ofType`, `AsyncContext` ούτε μηχανισμούς συγχώνευσης του `EventPublisher`· τα aggregates δημοσιεύουν events μέσω του `CommandBaseHandler`. Το `EventBus` του παραδίδει in-process: δεν είναι ανθεκτική παράδοση μηνυμάτων ούτε outbox. Μια εφαρμογή που βασίζεται σε κάποιο από αυτά διατηρεί το NestJS και ακολουθεί την Επιλογή 1.

### Τι αναλαμβάνει η ίδια η εφαρμογή

| Ευθύνη NestJS | Ισοδύναμο `@cqrs-ddd` |
| --- | --- |
| `@Module()`, `@Injectable()`, providers | Μια απλή συνάρτηση composition root που δημιουργεί εξαρτήσεις με `new` |
| `NestFactory.create(AppModule)` | `const cqrs = createCqrs(options); cqrs.register(...handlers);` |
| Lifecycle hooks τερματισμού | `await cqrs.close()`, και στη συνέχεια κλείσιμο των pools βάσης και συνδέσεων redis |
| Controllers, guards, interceptors, pipes | Εγγενείς διαδρομές και middleware του HTTP framework· δείτε [HTTP με Express και Fastify](/ddd-cqrs/el/guides/http/) |
| Request-scoped providers | `AsyncLocalStorage` μέσω των context sources (`tenantId`, `correlationId`) |

### Παράδειγμα σε Απλό Node.js

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

### Διαφορές στη Συμπεριφορά Runtime

- **Αυστηρή καταχώριση handlers**: Η καταχώριση δεύτερου handler για την ίδια εντολή ή ερώτημα αποτυγχάνει αμέσως στο `cqrs.register()`. Το NestJS σιωπηρά αντικαθιστά τους προηγούμενους με τον τελευταίο καταχωρισμένο.
- **Ασύγχρονα σφάλματα απόντος handler**: Στο `@cqrs-ddd/cqrs`, τα `commandBus.execute()` και `queryBus.execute()` απορρίπτουν ασύγχρονα με `CommandHandlerNotFoundException` ή `QueryHandlerNotFoundException`. Το `@nestjs/cqrs` εκτοξεύει σύγχρονα.
- **Ομαλός τερματισμός (Graceful Shutdown)**: Το `cqrs.close()` περιμένει την ολοκλήρωση όλων των ασύγχρονων event handlers πριν επιλυθεί. Στο NestJS, το `app.close()` δεν παρακολουθεί την ολοκλήρωση των παρασκηνιακών event handlers.
- **Απομόνωση σφαλμάτων events**: Όπως στο `@nestjs/cqrs`, η αποτυχία ενός event handler αποστέλλεται στο `UnhandledExceptionBus` και ο handler συνεχίζει να λαμβάνει μεταγενέστερα events· το `@cqrs-ddd/cqrs` επιπλέον την καταγράφει, ή την εκτοξεύει ξανά με `rethrowUnhandled: true`.

## Επιλέγοντας τη Σωστή Προσέγγιση

- Επιλέξτε την **Επιλογή 1 (`@cqrs-ddd/nestjs`)** όταν εργάζεστε σε υπάρχουσα βάση κώδικα NestJS, χρησιμοποιείτε NestJS microservices ή GraphQL, ή βασίζεστε έντονα στο οικοσύστημα controllers και DI modules του Nest.
- Επιλέξτε την **Επιλογή 2 (`@cqrs-ddd/cqrs`)** όταν χτίζετε μια νέα υπηρεσία σε απλό Node.js, Express ή Fastify, ή όταν θέλετε ρητή κατασκευή χωρίς dependency-injection container και καμία από τις δυνατότητες της ενότητας [Τι δεν περιλαμβάνεται](#τι-δεν-περιλαμβάνεται).
