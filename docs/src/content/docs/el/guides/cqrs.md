---
title: CQRS χωρίς NestJS
description: Μια εφαρμογή εντολών, ερωτημάτων και συμβάντων με το @cqrs-ddd/cqrs, με handler decorators, ένα pipeline ανά handler και buses από το createCqrs.
sidebar:
  order: 3
---

Αυτός ο οδηγός χτίζει μια μικρή εφαρμογή χρηστών στο [`@cqrs-ddd/cqrs`](/ddd-cqrs/el/packages/cqrs/):
handlers με decorators, ένα pipeline γύρω από τον καθένα και buses φτιαγμένα από το `createCqrs()`. Δεν υπάρχει container: μία συνάρτηση δημιουργεί τα πάντα με `new`, ώστε κάθε εξάρτηση να είναι ορατή και να ελέγχεται από τον compiler. Η εφαρμογή `api/` του repository είναι μια ολοκληρωμένη υλοποίηση φτιαγμένη με τον ίδιο τρόπο.

## Ports

Οι handlers εξαρτώνται από ports, τα οποία υλοποιεί η εφαρμογή: στη μνήμη για tests, σε βάση δεδομένων στην παραγωγή.

```typescript
export abstract class Users {
  abstract add(name: string): User;
  abstract find(id: string): User | undefined;
}

export abstract class Mailer {
  abstract send(to: string, text: string): Promise<void>;
}
```

## Εντολή (Command)

Το `CreateUserCommand` είναι μια απλή κλάση, και το `commandBus.execute<CreateUserCommand, string>()` πληκτρολογεί το αποτέλεσμά της. Ο handler της προσθέτει τον χρήστη και δημοσιεύει ένα event. Το `@UsePipeline` την εκτελεί μία φορά ανά request id και καταγράφει audit: ένα επαναλαμβανόμενο `requestId` επιστρέφει το αρχικό αποτέλεσμα χωρίς να ξανατρέξει ο handler.

```typescript
export class CreateUserCommand {
  constructor(
    readonly requestId: string,
    readonly name: string,
  ) {}
}

@CommandHandler(CreateUserCommand)
@UsePipeline(
  idempotent({ keyFactory: (context) => (context.request as CreateUserCommand).requestId }),
  audit({ action: 'user.create' }),
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    private readonly users: Users,
    private readonly events: EventBus,
  ) {}

  async execute(command: CreateUserCommand): Promise<string> {
    const user = this.users.add(command.name);
    this.events.publish(new UserCreatedEvent(user.id, user.name));
    return user.id;
  }
}
```

## Ερώτημα (Query)

Η εφαρμογή καταγράφει κάθε handler μέσω ενός καθολικού `LoggingBehavior`· το `@SkipPipeline(LoggingBehavior)` εξαιρεί αυτόν τον συγκεκριμένο.

```typescript
@QueryHandler(GetUserQuery)
@SkipPipeline(LoggingBehavior)
export class GetUserHandler implements IQueryHandler<GetUserQuery> {
  constructor(private readonly users: Users) {}

  async execute(query: GetUserQuery): Promise<User | undefined> {
    return this.users.find(query.id);
  }
}
```

## Event handler

Το event bus ξεκινά το `SendWelcomeMail` μέσα στο `publish()` χωρίς να το περιμένει με `await`, επομένως η εντολή δεν καθυστερεί περιμένοντας την αποστολή του email. Εκτελείται σε δικό του pipeline, υπό το correlation id της εντολής που προκάλεσε το event.

```typescript
@EventsHandler(UserCreatedEvent)
export class SendWelcomeMail implements IEventHandler<UserCreatedEvent> {
  constructor(private readonly mailer: Mailer) {}

  async handle(event: UserCreatedEvent): Promise<void> {
    await this.mailer.send(event.userId, `Welcome, ${event.name}!`);
  }
}
```

## Σύνδεση (Wiring)

Μία συνάρτηση στήνει ολόκληρη την εφαρμογή: τα instances των behaviors που χρειάζονται εξαρτήσεις, τα buses και έπειτα τους handlers με τα ports τους. Το `register()` μεταγλωττίζει το pipeline κάθε handler και αποτυγχάνει εκεί σε οποιοδήποτε σφάλμα διαμόρφωσης.

```typescript
import { createCqrs } from '@cqrs-ddd/cqrs';
import { LoggingBehavior } from '@cqrs-ddd/pipeline';
import { AuditBehavior } from '@cqrs-ddd/pipeline-audit';
import { IdempotencyBehavior, MemoryIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';

export function createApp(ports: { users: Users; mailer: Mailer; auditSink: AuditSink }) {
  const cqrs = createCqrs({
    behaviors: [
      new IdempotencyBehavior(new MemoryIdempotencyStore()),
      new AuditBehavior(ports.auditSink),
    ],
    globalBehaviors: { before: [LoggingBehavior] },
  });
  cqrs.register(
    new CreateUserHandler(ports.users, cqrs.eventBus),
    new GetUserHandler(ports.users),
    new SendWelcomeMail(ports.mailer),
  );
  return cqrs;
}
```

## Εκτέλεση

Το `close()` περιμένει την ολοκλήρωση των event handlers που εκτελούνται ακόμα, επομένως μετά από αυτό το καλωσόρισμα έχει σταλεί.

```typescript
const app = createApp({ users: new MemoryUsers(), mailer, auditSink: new PostgresAuditSink(pool) });
const id = await app.commandBus.execute<CreateUserCommand, string>(
  new CreateUserCommand('req-1', 'Ann'),
);
const user = await app.queryBus.execute<GetUserQuery, User | undefined>(
  new GetUserQuery(id),
);
await app.close();
```

Ο οδηγός [NestJS & @cqrs-ddd](/ddd-cqrs/el/guides/from-nestjs/) αναλύει τις διαφορές και τις επιλογές μετάβασης.
