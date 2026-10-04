---
title: DDD χωρίς framework
description: "Εκτελέστε commands του @cqrs-ddd/core και τους handlers τους μέσω pipeline, με δημοσίευση events μέσα στην αλυσίδα."
sidebar:
  order: 5
---

Αυτός ο οδηγός εκτελεί έναν command handler του `@cqrs-ddd/core` μέσω ενός pipeline του
`@cqrs-ddd/pipeline`, χωρίς κανένα framework και χωρίς DI container. Τα δύο πακέτα δεν εξαρτώνται
το ένα από το άλλο. Για buses και decorated handlers, δείτε
[CQRS χωρίς NestJS](/ddd-cqrs/el/guides/cqrs/).

## Το aggregate

Το `User` αλλάζει την κατάστασή του μόνο μέσω των events που εφαρμόζει: η μέθοδος `rename()` καταγράφει
ένα `UserRenamedEvent`, και η `onUserRenamedEvent` το εφαρμόζει.

```ts
import { AggregateRoot, DomainEvent } from '@cqrs-ddd/core/domain';

export class UserRenamedEvent extends DomainEvent {
  constructor(
    readonly userId: string,
    readonly name: string,
  ) {
    super();
  }
}

export class User extends AggregateRoot {
  #name: string;

  constructor(
    readonly id: string,
    name: string,
  ) {
    super();
    this.#name = name;
  }

  rename(name: string): this {
    if (name !== this.#name) this.apply(new UserRenamedEvent(this.id, name));
    return this;
  }

  protected onUserRenamedEvent(event: UserRenamedEvent): void {
    this.#name = event.name;
  }
}
```

## Το pipeline

Κάθε command καταγράφεται (audited), εδώ σε ένα in-memory trail:

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import { AuditBehavior, type AuditRecord } from '@cqrs-ddd/pipeline-audit';

export const auditTrail: AuditRecord[] = [];

export const pipeline = createPipeline({
  behaviors: [new AuditBehavior({ write: (record) => void auditTrail.push(record) })],
});
```

## Το command και ο handler του

Το `RenameUserCommand` επεκτείνει το `BaseCommand`, το οποίο φέρει το brand `REQUEST_KIND`,
ώστε το pipeline να γνωρίζει ότι είναι command και να ονομάζει τη λειτουργία `RenameUserCommand`.
Ο decorator δεν χρειάζεται επιλογές: `@pipeline.wrap(audit(...))`.

Το `CommandBaseHandler.execute()` καλεί τη μέθοδο `handle()` και στη συνέχεια δημοσιεύει τα events του aggregate.
Ο handler κάνει override το `execute()` μόνο για να το διακοσμήσει (decorate), ώστε ολόκληρη η διαδικασία,
συμπεριλαμβανομένης της δημοσίευσης (publication), να εκτελείται μέσα στο pipeline: τα behaviors βλέπουν
τα events ως μέρος του command, και μια αποτυχημένη δημοσίευση αποτυγχάνει το command.

```ts
import { BaseCommand, CommandBaseHandler, type IDomainEventPublisher } from '@cqrs-ddd/core/application';
import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import { audit } from '@cqrs-ddd/pipeline-audit';

export class RenameUserCommand extends BaseCommand {
  constructor(
    readonly userId: string,
    readonly name: string,
  ) {
    super();
  }
}

export class RenameUserHandler extends CommandBaseHandler<RenameUserCommand, User> {
  constructor(
    private readonly users: Map<string, User>,
    eventBus: IDomainEventPublisher,
  ) {
    super(eventBus);
  }

  async handle(command: RenameUserCommand): Promise<User> {
    const user = this.users.get(command.userId);
    if (!user) throw new EntityNotFoundException('User', command.userId);
    return user.rename(command.name);
  }

  @pipeline.wrap(audit({ action: 'user.rename', severity: 'medium' }))
  override async execute(command: RenameUserCommand): Promise<User> {
    return super.execute(command);
  }
}
```

## Εκτέλεση

Η εγγραφή audit φέρει το όνομα και το είδος (kind) που λαμβάνονται από το command και το όνομα του handler
`RenameUserHandler.execute`. Το event δημοσιεύεται ενώ εκτελείται το pipeline.

```ts
const users = new Map([['u-1', new User('u-1', 'Ann')]]);
const published: unknown[] = [];
const handler = new RenameUserHandler(users, {
  publishAll: (events) => void published.push(...events),
});

await handler.execute(new RenameUserCommand('u-1', 'Anna'));
auditTrail[0]; // { requestKind: 'command', requestName: 'RenameUserCommand', handlerName: 'RenameUserHandler.execute', … }
published; // [UserRenamedEvent]
```

Ο κώδικας γίνεται compile με `experimentalDecorators: true`. Το persistence εδώ είναι ένα `Map`.
Μια πραγματική εφαρμογή υλοποιεί τα repository contracts του
[`@cqrs-ddd/core`](/ddd-cqrs/el/packages/core/), με το
[`@cqrs-ddd/mikro-orm`](/ddd-cqrs/el/packages/mikro-orm/) ή τον δικό της adapter.

## Στο repository

Ο κώδικας αυτού του οδηγού εκτελείται στο [`integration/profiles/`](https://github.com/aristoteliss/ddd-cqrs/tree/master/integration/profiles),
ενώ το [`integration/members/`](https://github.com/aristoteliss/ddd-cqrs/tree/master/integration/members) τοποθετεί
το ίδιο είδος aggregate στα buses του `@cqrs-ddd/cqrs`. Δύο ακόμα εφαρμογές χρησιμοποιούν το `@cqrs-ddd/core`
χωρίς pipeline ή buses:

- [`integration/library/`](https://github.com/aristoteliss/ddd-cqrs/tree/master/integration/library): ένα book aggregate
  με value rules, πεδία `@Mutable` και μεθόδους `@ApplyMutation`, καθώς και υποκλάσεις `CommandBaseHandler`
  που δημοσιεύουν τα events του σε ένα in-memory repository. Ένας δανεισμός που απορρίπτεται δεν αποθηκεύει
  ούτε δημοσιεύει τίποτα. Μια εγγραφή από μη ενημερωμένο αντίγραφο (stale copy) αποτυγχάνει με `ConcurrencyConflictError`.
- [`integration/inventory/`](https://github.com/aristoteliss/ddd-cqrs/tree/master/integration/inventory): repositories
  που δηλώνουν το persistence τους με τους core decorators, πάνω σε MikroORM σε in-memory SQLite,
  με το repository cache στην ίδια βάση δεδομένων:

  ```ts
  @PersistedWrite<Product>({
    cache: { setKey: (product) => productKey(product.id) },
    unique: { sku: (product) => new DuplicateSkuException(product) },
  })
  async save(product: Product): Promise<ProductSnapshot> { … }
  ```

Το [`api/`](https://github.com/aristoteliss/ddd-cqrs/tree/master/api) χρησιμοποιεί και τις δύο οικογένειες
μαζί, πάνω στα buses του `@cqrs-ddd/cqrs`.
