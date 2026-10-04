---
title: "NestJS & @cqrs-ddd: Ενσωμάτωση ή Μετάβαση"
description: "Πώς να χρησιμοποιήσετε το @cqrs-ddd με το NestJS μέσω του @cqrs-ddd/nestjs, ή να μεταβείτε από το @nestjs/cqrs στο @cqrs-ddd/cqrs χωρίς framework."
sidebar:
  order: 4
---

Ομάδες που χρησιμοποιούν NestJS έχουν δύο αρχιτεκτονικές επιλογές όταν υιοθετούν το `@cqrs-ddd`:

1. **Διατήρηση του NestJS και ενίσχυσή του** με το [`@cqrs-ddd/nestjs`](/ddd-cqrs/el/packages/nestjs/): Διατηρείτε τους υπάρχοντες handlers, τα modules, το dependency injection και τους controllers του `@nestjs/cqrs`. Ο adapter τυλίγει τους handlers σε pipelines συμπεριφορών (behaviors), παρέχει κεντρικό exception filtering και διαχειρίζεται το correlation και το job context.
2. **Πλήρης αντικατάσταση του NestJS** με το [`@cqrs-ddd/cqrs`](/ddd-cqrs/el/packages/cqrs/): Δημιουργία εφαρμογών χωρίς framework σε απλό Node.js, Fastify ή Express, κατασκευάζοντας τους handlers με `new` και καταχωρίζοντάς τους στο `createCqrs()`.

## Σύγκριση Αρχιτεκτονικής

| Διάσταση | Καθαρό `@nestjs/cqrs` | NestJS + `@cqrs-ddd/nestjs` | `@cqrs-ddd/cqrs` χωρίς framework |
| --- | --- | --- | --- |
| **Handler Decorators** | `@CommandHandler`, `@QueryHandler`, `@EventsHandler` | Ίδιοι decorators του `@nestjs/cqrs` + `@UsePipeline`, `@SkipPipeline` | Ίδια ονόματα από το `@cqrs-ddd/cqrs` + `@UsePipeline`, `@SkipPipeline` |
| **Buses** | `CommandBus`, `QueryBus`, `EventBus` | Ίδια buses του `@nestjs/cqrs` | Ίδια ονόματα buses, από το `createCqrs()` |
| **Pipeline Behaviors** | Κανένα (απαιτούνται interceptors) | Μεταγλωττίζει και εκτελεί το `@cqrs-ddd/pipeline` γύρω από handlers | Μεταγλωττίζει και εκτελεί το `@cqrs-ddd/pipeline` γύρω από handlers |
| **DI & Containers** | IoC container του NestJS | IoC container του NestJS παρέχει behaviors και handlers | Χωρίς container: ρητή χρήση `new` στο composition root |
| **Exception Handling** | Χειροκίνητα exception filters | Αυτόματο `ErrorFilter` που μετατρέπει σφάλματα σε `HttpException` | Framework-neutral: το HTTP επίπεδο αντιστοιχίζει σφάλματα (`domainErrorHttpStatus`) |
| **Διαγνωστικοί έλεγχοι εκκίνησης** | Σιωπηρή επικάλυψη σε διπλότυπους handlers | Επαληθεύει singleton scope, μοναδικότητα providers, συμβόλαια behaviors | Αποτυγχάνει σε διπλότυπους handlers, ελλιπείς decorators, παραβιάσεις συμβολαίων |
| **Αποτύπωμα Runtime** | NestJS runtime (~40MB+ εκκίνηση) | NestJS runtime | Ελάχιστο (μηδενικό framework overhead, άμεση εκκίνηση) |

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

1. **`PipelineModule.forRoot()`** στο `AppModule`:
   ```typescript
   @Module({
     imports: [
       CqrsModule.forRoot(),
       PipelineModule.forRoot({
         sources: { tenantId: getTenantId, correlationId: getCorrelationId },
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

3. **Δημοσίευση Domain Events**:
   Κληρονομήστε από τον `CommandBaseHandler` του `@cqrs-ddd/core/application` και περάστε το injected `EventBus` του `@nestjs/cqrs`. Όταν η `handle(command)` επιστρέφει ένα `AggregateRoot`, τα μη καταχωρισμένα domain events δημοσιεύονται αυτόματα μέσω του `eventBus.publishAll()` και καθαρίζονται.

---

## Επιλογή 2: Μετάβαση από το NestJS στο `@cqrs-ddd/cqrs`

Εάν ο στόχος σας είναι η κατάργηση του NestJS για μια ελαφριά αρχιτεκτονική χωρίς framework (Express, Fastify, AWS Lambda, Cloudflare Workers), χρησιμοποιήστε το `@cqrs-ddd/cqrs`:

```bash
pnpm add @cqrs-ddd/cqrs @cqrs-ddd/pipeline @cqrs-ddd/core
```

### Τι μεταφέρεται αυτούσιο

Το API του πυρήνα CQRS ταιριάζει με το `@nestjs/cqrs`:

| `@nestjs/cqrs` | `@cqrs-ddd/cqrs` |
| --- | --- |
| `@CommandHandler(Command)` | `@CommandHandler(Command)` από το `@cqrs-ddd/cqrs` |
| `@QueryHandler(Query)` | `@QueryHandler(Query)` από το `@cqrs-ddd/cqrs` |
| `@EventsHandler(...Events)` | `@EventsHandler(...Events)` από το `@cqrs-ddd/cqrs` |
| `ICommandHandler<TCommand>` | `ICommandHandler<TCommand>` από το `@cqrs-ddd/cqrs` |
| `IQueryHandler<TQuery>` | `IQueryHandler<TQuery>` από το `@cqrs-ddd/cqrs` |
| `IEventHandler<TEvent>` | `IEventHandler<TEvent>` από το `@cqrs-ddd/cqrs` |
| `CommandBus`, `QueryBus`, `EventBus` | Επιστρέφονται από το `createCqrs()` |

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
import { audit } from '@cqrs-ddd/pipeline-audit';

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
export function buildApplication(users: UsersRepository, auditSink: IAuditSink) {
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
- **Απομόνωση σφαλμάτων events**: Οι αποτυχίες των event handlers αποστέλλονται στο `UnhandledExceptionBus` και καταγράφονται. Σε αντίθεση με το `@nestjs/cqrs`, οι handlers συνεχίζουν να λαμβάνουν μεταγενέστερα events ακόμα και μετά από προηγούμενη αποτυχία.
- **Δεν παρέχονται στο `@cqrs-ddd/cqrs`**: Sagas, RxJS pipes με `ofType`, `AsyncContext` και μηχανισμοί συγχώνευσης του `EventPublisher`. Τα aggregates δημοσιεύουν events μέσω του `CommandBaseHandler`.

## Επιλέγοντας τη Σωστή Προσέγγιση

- Επιλέξτε την **Επιλογή 1 (`@cqrs-ddd/nestjs`)** όταν εργάζεστε σε υπάρχουσα βάση κώδικα NestJS, χρησιμοποιείτε NestJS microservices ή GraphQL, ή βασίζεστε έντονα στο οικοσύστημα controllers και DI modules του Nest.
- Επιλέξτε την **Επιλογή 2 (`@cqrs-ddd/cqrs`)** όταν χτίζετε νέα microservices, serverless functions, APIs υψηλής απόδοσης σε Fastify, ή εφαρμογές όπου απαιτείται μηδενική επιβάρυνση dependency injection και άμεση εκκίνηση.
