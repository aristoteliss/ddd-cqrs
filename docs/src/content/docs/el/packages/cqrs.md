---
title: "@cqrs-ddd/cqrs"
description: "Command, query και event buses με handler decorators και ένα pipeline ανά handler, κατασκευασμένα από το createCqrs() χωρίς container."
sidebar:
  order: 2
---

Εκτελεί commands, queries και events μέσω των διακοσμημένων handlers τους, καθένας εκ των οποίων γίνεται compile μέσα στο δικό του pipeline από behaviors.

Τα `@CommandHandler`, `@QueryHandler` και `@EventsHandler` σηματοδοτούν κλάσεις handler. Τα `@UsePipeline` και `@SkipPipeline` από το `@cqrs-ddd/pipeline` δηλώνουν τα behaviors τους. Το `createCqrs()` κατασκευάζει τα runtime buses (`CommandBus`, `QueryBus`, `EventBus`, `UnhandledExceptionBus`). Δεν υπάρχει dependency-injection container ή framework: η εφαρμογή δημιουργεί τα instances των handlers με `new`, περνά τις απαραίτητες εξαρτήσεις άμεσα, και τα καταχωρεί.

Χρησιμοποιήστε το `@cqrs-ddd/cqrs` για αρχιτεκτονικές χωρίς framework (απλό Node.js, Fastify, Express). Εάν αναπτύσσετε σε NestJS, χρησιμοποιήστε το [`@cqrs-ddd/nestjs`](/ddd-cqrs/el/packages/nestjs/) για να κάνετε wrap τους επίσημους handlers του `@nestjs/cqrs`.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/cqrs @cqrs-ddd/pipeline
```

Απαιτεί Node.js 22.12 ή νεότερο. Οι decorators υποστηρίζουν τόσο τα standard decorators του TypeScript 5+ όσο και τα legacy `experimentalDecorators`.

## Γρήγορο παράδειγμα

Μια πλήρης εφαρμογή σε ένα αρχείο: ένα command με επικυρωμένο payload, ο handler του, ένα event και ο handler του, κατασκευασμένα και καταχωρισμένα χωρίς container. Σε έναν άδειο κατάλογο:

```bash
pnpm add @cqrs-ddd/cqrs @cqrs-ddd/pipeline @cqrs-ddd/pipeline-zod zod
pnpm add -D typescript @types/node
```

Αποθηκεύστε το παρακάτω ως `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "strict": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["create-user.mts"]
}
```

Αποθηκεύστε το παρακάτω ως `create-user.mts`· η κατάληξη `.mts` το κάνει ES module χωρίς ρύθμιση στο `package.json`:

```ts
import {
  CommandHandler,
  createCqrs,
  type EventBus,
  EventsHandler,
  type ICommandHandler,
  type IEventHandler,
} from '@cqrs-ddd/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { validated, ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

class CreateUserCommand {
  constructor(readonly email: string) {}
}

class UserCreatedEvent {
  constructor(
    readonly id: string,
    readonly email: string,
  ) {}
}

@CommandHandler(CreateUserCommand)
@UsePipeline(validated(z.object({ email: z.email() })))
class CreateUserHandler implements ICommandHandler<CreateUserCommand, string> {
  constructor(
    private readonly users: Map<string, string>,
    private readonly events: EventBus,
  ) {}

  async execute(command: CreateUserCommand): Promise<string> {
    const id = `user_${this.users.size + 1}`;
    this.users.set(id, command.email);
    this.events.publish(new UserCreatedEvent(id, command.email));
    return id;
  }
}

@EventsHandler(UserCreatedEvent)
class WelcomeUser implements IEventHandler<UserCreatedEvent> {
  async handle(event: UserCreatedEvent): Promise<void> {
    console.log(`Welcome, ${event.email}`);
  }
}

const cqrs = createCqrs();
cqrs.register(
  new CreateUserHandler(new Map(), cqrs.eventBus),
  new WelcomeUser(),
);

const id = await cqrs.commandBus.execute<CreateUserCommand, string>(
  new CreateUserCommand('ada@example.com'),
);
console.log(`Created ${id}`);

try {
  await cqrs.commandBus.execute(new CreateUserCommand('not-an-email'));
} catch (error) {
  if (!(error instanceof ZodValidationError)) throw error;
  console.log('Invalid email rejected before the handler ran');
}

await cqrs.close();
```

Κάντε compile και εκτελέστε το:

```bash
pnpm exec tsc
node dist/create-user.mjs
```

Τυπώνει:

```text
Wrapping CreateUserHandler.execute() [command] with pipeline: [ZodValidationBehavior]
Welcome, ada@example.com
Created user_1
Invalid email rejected before the handler ran
```

Η πρώτη γραμμή είναι η σύνοψη που καταγράφει το `register()` για κάθε handler που κάνει compile, στο επίπεδο `bootstrapLogLevel`. Ο event handler εκτελείται μόλις δημοσιευτεί το event, πριν το command επιστρέψει το αποτέλεσμά του. Οι χρήστες ζουν σε ένα `Map`: τίποτα δεν αποθηκεύεται. Ο οδηγός [CQRS χωρίς NestJS](/ddd-cqrs/el/guides/cqrs/) χτίζει μια μεγαλύτερη εφαρμογή με ports, ένα query και behaviors που παίρνουν δικά τους instances.

## Επιλογές παραμετροποίησης `createCqrs`

| Επιλογή | Τύπος | Προεπιλογή | Περιγραφή |
| --- | --- | --- | --- |
| `behaviors` | `IPipelineBehavior[]` | `[]` | Singleton instances από behaviors που παρέχονται στα pipelines. Δηλωμένα behaviors χωρίς ρητό instance κατασκευάζονται με `new` χωρίς ορίσματα. |
| `globalBehaviors` | `GlobalBehaviorsOptions \| GlobalBehaviorsOptions[]` | κανένα | Behaviors τοποθετημένα γύρω από κάθε handler εντός των καθορισμένων scopes (`'all'`, `'commands'`, `'queries'`, `'events'`). |
| `sources` | `ContextSources` | κανένα | Από πού τα pipelines διαβάζουν και επαναφέρουν το `tenantId` και το `correlationId`, όπως `tenantSource` και `correlationSource`. |
| `diagnostics` | `'strict' \| 'warn' \| 'off'` | `'strict'` | Λειτουργία ελέγχου contract κατά το `register()`: το `'strict'` ρίχνει `PipelineConfigurationError`, το `'warn'` καταγράφει log, το `'off'` απενεργοποιεί τους ελέγχους. |
| `logger` | `PipelineLogger` | `console` | Logger προορισμού για εκτέλεση pipeline, diagnostics και μη διαχειρίσιμα σφάλματα events. Το `pinoLogger(pino)` προσαρμόζει το Pino. |
| `bootstrapLogLevel` | `LogLevel \| 'none'` | `'debug'` | Επίπεδο καταγραφής για τη συνοπτική γραμμή που εκτυπώνεται κατά το compile του pipeline κάθε handler. |
| `rethrowUnhandled` | `boolean` | `false` | Όταν είναι `true`, μη διαχειρίσιμα σφάλματα σε ασύγχρονους event handlers ρίχνονται ως uncaught exceptions της διεργασίας αντί να καταγράφονται απλώς σε log. |

Το `createCqrs()` επιστρέφει `{ commandBus, queryBus, eventBus, unhandledExceptionBus, register, close }`.

## Αρχιτεκτονική handlers & Invariants

| Decorator | Interface | Μέθοδος | Invariant |
| --- | --- | --- | --- |
| `@CommandHandler(CommandClass)` | `ICommandHandler<TCommand, TResult>` | `execute(command)` | Ακριβώς ένας handler ανά κλάση command. Η καταχώριση διπλότυπου ρίχνει άμεσα σφάλμα κατά την εκκίνηση. |
| `@QueryHandler(QueryClass)` | `IQueryHandler<TQuery, TResult>` | `execute(query)` | Ακριβώς ένας handler ανά κλάση query. Η καταχώριση διπλότυπου ρίχνει άμεσα σφάλμα κατά την εκκίνηση. |
| `@EventsHandler(...EventClasses)` | `IEventHandler<TEvent>` | `handle(event)` | Οποιοσδήποτε αριθμός handlers ανά κλάση event. Οι handlers εκτελούνται παράλληλα όταν δημοσιεύεται το event. |

### Κληρονομικότητα κλάσεων αιτήματος (Request Class Inheritance)

Εάν ένα instance command ή query δεν έχει άμεσα καταχωρημένο handler για τον συγκεκριμένο constructor του, το bus αναζητά προς τα πάνω στην ιεραρχία prototype και δρομολογεί στον handler που είναι καταχωρημένος για την πλησιέστερη γονική κλάση.

Τα αιτήματα μπορούν να είναι οποιεσδήποτε κλάσεις. Κλάσεις που επεκτείνουν το `BaseCommand` ή το `BaseQuery` από το `@cqrs-ddd/core/application` φέρουν το brand `REQUEST_KIND`, ώστε τα behaviors να διακρίνουν ένα command από ένα query, καθώς και ένα προαιρετικό session principal εκτός των enumerable πεδίων τους.

### Generic Result Typing

Τα buses δέχονται generic παραμέτρους τύπων στο `execute()`:

```typescript
const result = await cqrs.queryBus.execute<GetUserQuery, UserDto>(new GetUserQuery('u_1'));
```

## Σημασιολογία εκτέλεσης pipeline

Οι handlers δηλώνουν το pipeline τους χρησιμοποιώντας τα `@UsePipeline(...entries)` και `@SkipPipeline(...Behaviors)` από το `@cqrs-ddd/pipeline`:

1. **Compilation κατά την καταχώριση**: Όταν εκτελείται το `cqrs.register(...handlers)`, το pipeline κάθε handler γίνεται compile σε μία βελτιστοποιημένη συνάρτηση runner μία φορά. Δεν πραγματοποιείται δυναμικό reflection μεταδεδομένων κατά το runtime dispatch.
2. **Σειρά των behaviors**: Μια κλήση περνά πρώτα από τα global `before` behaviors, έπειτα από τα behaviors του ίδιου του handler με τη σειρά δήλωσής τους, έπειτα από τα global `after` behaviors, και φτάνει τελευταία στη μέθοδο `execute` του handler· το αποτέλεσμα επιστρέφει μέσα από τα ίδια behaviors με αντίστροφη σειρά. Το `after` δηλώνει θέση, την πλησιέστερη στον handler, όχι βήμα που εκτελείται αφού τελειώσει ο handler. Δείτε [Σειρά εκτέλεσης](/ddd-cqrs/el/concepts/execution-order/).
3. **Execution context**: Κάθε εκτέλεση λαμβάνει ένα `IPipelineContext` που περιέχει τα `handlerName`, `requestName`, `requestKind`, `correlationId`, `tenantId`, και typed `items`.
4. **Skip isolation**: Το `@SkipPipeline(LoggingBehavior)` αφαιρεί το καθορισμένο global behavior για τον συγκεκριμένο handler χωρίς να επηρεάζει άλλους handlers.

## Αναλυτικά τα buses

### `CommandBus`

- **Σκοπός**: Τροποποιεί την κατάσταση της εφαρμογής ή του domain.
- **Dispatch**: Το `commandBus.execute(command)` περιμένει το pipeline του handler και επιστρέφει το αποτέλεσμα.
- **Ελλείπων handler**: Εάν δεν έχει καταχωρηθεί handler, απορρίπτει με `CommandHandlerNotFoundException`.

### `QueryBus`

- **Σκοπός**: Διαβάζει δεδομένα χωρίς μεταβολή της κατάστασης.
- **Dispatch**: Το `queryBus.execute(query)` περιμένει το pipeline του handler και επιστρέφει το αποτέλεσμα του query.
- **Ελλείπων handler**: Εάν δεν έχει καταχωρηθεί handler, απορρίπτει με `QueryHandlerNotFoundException`.

### `EventBus`

- **Σκοπός**: Δημοσιεύει domain και integration events μεταξύ bounded contexts.
- **Dispatch**: Τα `eventBus.publish(event)` και `eventBus.publishAll(events)` ειδοποιούν όλους τους καταχωρημένους event handlers.
- **Ασύγχρονη μη-μπλοκαριστική εκτέλεση**: Το `publish()` πυροδοτεί τους handlers και επιστρέφει άμεσα χωρίς να περιμένει την ολοκλήρωση των promises. Η σύγχρονη αρχικοποίηση εκτελείται πριν από την επιστροφή.
- **Ελλείποντες handlers**: Events που δημοσιεύονται χωρίς καταχωρημένους handlers αγνοούνται με ασφάλεια.
- **In-process παράδοση**: Ένα event υπάρχει μόνο στη μνήμη μέχρι να εκτελεστούν οι handlers του. Ένα pipeline γύρω από έναν handler δεν προσθέτει ανθεκτική παράδοση μηνυμάτων ούτε outbox: δείτε τα [Σημεία προσοχής](#σημεία-προσοχής--οδηγίες-παραγωγής).
- **DDD Integration**: Το `EventBus` υλοποιεί το `IDomainEventPublisher` από το `@cqrs-ddd/core/application`, επιτρέποντας στο `CommandBaseHandler` να δημοσιεύει άμεσα τα buffered domain events των aggregates.

### `UnhandledExceptionBus`

- **Σκοπός**: Κεντρικός χειρισμός για αποτυχίες ασύγχρονων event handlers.
- Όταν ένα promise ενός event handler απορρίπτεται, η αποτυχία δεν μπορεί να επιστραφεί στον εκδότη (publisher). Το bus εκπέμπει το σφάλμα και το event στο `UnhandledExceptionBus`.
- Εξ ορισμού, τα unhandled exceptions καταγράφονται στο επίπεδο `'error'`.
- Συνδρομή σε ειδοποιήσεις:
  ```typescript
  const subscription = cqrs.unhandledExceptionBus.subscribe(({ exception, cause }) => {
    alerts.captureException(exception, { extra: { event: cause } });
  });

  // Αργότερα:
  subscription.unsubscribe();
  ```
- Εάν έχει οριστεί `rethrowUnhandled: true` στο `createCqrs()`, οι αποτυχίες ρίχνονται ξανά ως uncaught exceptions, πυροδοτώντας τον τερματισμό της διεργασίας ή επανεκκίνηση από τον orchestrator.

## Ομαλός τερματισμός (Graceful Shutdown)

Περιμένετε πάντοτε το `cqrs.close()` πριν κλείσετε τις εξωτερικές υποδομές (συνδέσεις βάσης δεδομένων, message brokers, caches):

```typescript
process.on('SIGTERM', async () => {
  // 1. Διακοπή αποδοχής νέας HTTP κυκλοφορίας
  await server.close();

  // 2. Αναμονή για ολοκλήρωση των ασύγχρονων event handlers που εκτελούνται
  await cqrs.close();

  // 3. Κλείσιμο συνδέσεων βάσης δεδομένων και cache
  await dbPool.end();
  await redis.quit();
});
```

Το `cqrs.close()` παρακολουθεί όλες τις εκκρεμείς εκτελέσεις ασύγχρονων event handlers και ολοκληρώνεται μόνο αφού ολοκληρωθούν όλοι οι ενεργοί handlers.

## Σημεία προσοχής & Οδηγίες παραγωγής

1. **In-process παράδοση μόνο**: Οι handlers εκτελούνται στο event loop του Node.js. Εάν η διεργασία τερματιστεί απρόσμενα πριν εκτελεστεί ένας event handler, το event χάνεται. Για εγγυημένη, ανθεκτική παράδοση μεταξύ services, συνδυάστε τα domain events με το Transactional Outbox pattern.
2. **Οι handlers είναι singletons**: Τα instances των handlers δημιουργούνται μία φορά και διαμοιράζονται σε όλες τις κλήσεις. Οι handlers οφείλουν να είναι stateless. State που αφορά το αίτημα (ταυτότητα χρήστη, correlation tokens, tenant IDs) πρέπει να διαβάζεται από το `AsyncLocalStorage` μέσω context sources.
3. **Χωρίς prototype patching**: Πολλαπλά ανεξάρτητα CQRS runtimes μπορούν να συνυπάρχουν στην ίδια διεργασία Node.js χωρίς παρεμβολές μεταξύ τους.

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/cqrs/)
