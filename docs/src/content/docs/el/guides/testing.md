---
title: Έλεγχος handlers (Testing)
description: "Ελέγξτε έναν handler μεμονωμένα, και έπειτα ολόκληρη την εφαρμογή με τα pipelines και τους event handlers της, χρησιμοποιώντας in-memory doubles."
sidebar:
  order: 11
---

Ένας handler είναι μια απλή κλάση, και μια εφαρμογή είναι μια συνάρτηση που κατασκευάζει τους handlers
της με `new`. Συνεπώς, τα tests δεν χρειάζονται κανένα ειδικό testing module: κατασκευάστε τον handler
για ένα unit test, και δημιουργήστε την εφαρμογή με test doubles για τον έλεγχο της καλωδίωσής της (wiring).

## Ένας handler μεμονωμένα

Ένα test καλεί τον constructor απευθείας. Κανένα pipeline δεν εκτελείται: το test καλύπτει αποκλειστικά
τη λογική του ίδιου του handler.

```ts
it('adds the user and publishes UserCreatedEvent', async () => {
  const users = new MemoryUsers();
  const published: unknown[] = [];
  const handler = new CreateUserHandler(users, {
    publish: (event) => void published.push(event),
  } as EventBus);

  const id = await handler.execute(new CreateUserCommand('req-1', 'Ann'));

  expect(users.find(id)).toEqual({ id, name: 'Ann' });
  expect(published).toEqual([expect.any(UserCreatedEvent)]);
});
```

## Η εφαρμογή με test doubles

Η συνάρτηση που δομεί την εφαρμογή δέχεται τα ports που χρειάζεται, και ένα test περνά doubles:

```ts
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
    new SendWelcomeMail(ports.mailer),
  );
  return cqrs;
}
```

```ts
it('creates a user once per request id, audits it and sends one welcome mail', async () => {
  const mails: string[] = [];
  const audits: AuditRecord[] = [];
  const app = createApp({
    users: new MemoryUsers(),
    mailer: { send: async (to) => void mails.push(to) },
    auditSink: { write: (record) => void audits.push(record) },
  });

  const first = await app.commandBus.execute(new CreateUserCommand('req-1', 'Ann'));
  const again = await app.commandBus.execute(new CreateUserCommand('req-1', 'Ann'));
  await app.close();

  expect(again).toBe(first);
  expect(mails).toEqual([first]);
  expect(audits).toHaveLength(1);
});
```

Η μέθοδος `close()` περιμένει τους event handlers που βρίσκονται ακόμη σε εξέλιξη, ώστε τα assertions
μετά από αυτήν να επαληθεύσουν τις ενέργειές τους (εδώ την αποστολή του welcome mail).

Η δόμηση της εφαρμογής αποτελεί από μόνη της έλεγχο των ρυθμίσεων: το `register()` αποτυγχάνει αν υπάρξει
δεύτερος handler για το ίδιο command, μια κλάση χωρίς decorator, ή παραβίαση συμβολαίου behavior
(`diagnostics: 'strict'`, η προεπιλογή), και το `createCqrs()` αποτυγχάνει σε ένα global behavior
που δεν μπορεί να κατασκευαστεί.

## Tenant και principal

Behaviors που διαχωρίζουν τα κλειδιά τους ανά tenant ή ελέγχουν principal αποτυγχάνουν με ασφάλεια
(fail closed) εκτός αιτήματος. Ένα test εκτελεί την κλήση εντός του context που θα όριζε ένα αίτημα:

```ts
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';

await runWithTenant('acme', () => app.commandBus.execute(new CreateUserCommand('req-1', 'Ann')));
```

Το principal ορίζεται με τον ίδιο τρόπο, μέσω του `AsyncLocalStorage` store της ίδιας της εφαρμογής
από το οποίο διαβάζει η πηγή δικαιωμάτων CASL (CASL permission source).

## Ήσυχα logs (Quiet logs)

Το `LoggingBehavior`, οι αποτυχημένοι event handlers και οι γραμμές εκκίνησης γράφουν στο `logger` του
`createCqrs()`, που εξ ορισμού είναι το `console`. Ένα test μπορεί να περάσει έναν σιωπηλό logger,
ή έναν logger που καταγράφει γραμμές για assertions:

```ts
createCqrs({
  globalBehaviors: { before: [LoggingBehavior] },
  logger: { log() {}, warn() {}, error() {} },
  bootstrapLogLevel: 'none',
});
```

## Ένα behavior μεμονωμένα

Ένα behavior είναι επίσης μια απλή κλάση: ένα pipeline το εκτελεί γύρω από μια συνάρτηση, χωρίς buses.

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';

const sink = { write: vi.fn() };
const rename = createPipeline({ behaviors: [new AuditBehavior(sink)] }).wrap(
  { name: 'renameUser', kind: 'command' },
  AuditBehavior,
)(async (name: string) => name);

await rename('Ann');
expect(sink.write).toHaveBeenCalledOnce();
```
