---
title: Background jobs
description: "Τοποθετήστε background jobs σε ουρά από handlers και εκτελέστε τα εντός του tenant, correlation id και principal του αιτήματος που τα δημιούργησε, ή εκτελέστε προγραμματισμένες εργασίες ως service principal."
sidebar:
  order: 10
---

Ένα job εκτελείται αργότερα, σε άλλη διεργασία ή άλλο event loop tick, χωρίς το αρχικό αίτημα που το έβαλε στην ουρά.
Το [`@cqrs-ddd/pipeline-job-context`](/ddd-cqrs/el/packages/pipeline-job-context/) αποτυπώνει
το tenant, το correlation id και το principal του αιτήματος στο payload του job, και τα επαναφέρει
όταν το job εκτελείται, ώστε τα pipelines, τα κλειδιά και το authorization του job να συμπεριφέρονται
ακριβώς όπως στο αρχικό αίτημα. Αυτός ο οδηγός χρησιμοποιεί το BullMQ. Οποιαδήποτε ουρά μεταφέρει ένα
JSON payload λειτουργεί με τον ίδιο τρόπο.

## Το principal

Η εφαρμογή καθορίζει πώς διαβάζεται το τρέχον principal και πώς εκτελείται εργασία εκ νέου ως principal,
υλοποιώντας το `IJobPrincipal` πάνω στο δικό της authentication state:

```ts
import type { IJobPrincipal, PrincipalReference } from '@cqrs-ddd/pipeline-job-context';

export class SessionJobPrincipal implements IJobPrincipal {
  constructor(private readonly sessions: Sessions) {}

  capture(): PrincipalReference | undefined {
    const principal = sessionPrincipalStore.getStore();
    return principal && { id: principal.id, type: principal.type, sessionId: principal.sid };
  }

  async restore<T>(principal: PrincipalReference, work: () => Promise<T>): Promise<T> {
    const current = await this.sessions.findActive(principal);
    if (!current) throw new Error(`The session of ${principal.id} is no longer active.`);
    return sessionPrincipalStore.run(current, work);
  }
}
```

Το payload διατηρεί μόνο τα `id`, `type` και `sessionId`, ποτέ δικαιώματα (permissions): το `restore()`
φορτώνει ξανά το principal, έτσι ώστε ένα ανακληθέν session (revoked session) ή ένας διαγραμμένος χρήστης
να απορρίπτει άμεσα το job.

## Καταχώριση του job context

Η συνάρτηση `registerJobContext()`, που καλείται μία φορά κατά την εκκίνηση της εφαρμογής, καταχωρεί
το principal, τα έγκυρα tenants στα οποία μπορεί να εκτελεστεί ένα job, και τις πηγές tenant και correlation id.
Επιστρέφει τη συνάρτηση αφαίρεσης καταχώρισης (unregister) για τον τερματισμό της εφαρμογής:

```ts
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { registerJobContext } from '@cqrs-ddd/pipeline-job-context';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

const unregister = registerJobContext({
  principal: new SessionJobPrincipal(sessions),
  tenants: config.tenants,
  sources: { tenantId: tenantSource, correlationId: correlationSource },
});
```

## Εισαγωγή στην ουρά από event handler (Enqueueing)

Η συνάρτηση `withJobContext(data)` προσθέτει το τρέχον context στο payload. Ρίχνει
`MissingJobContextError` εκτός tenant ή χωρίς principal, διασφαλίζοντας ότι ένα job δεν
τοποθετείται ποτέ στην ουρά χωρίς το context στο οποίο οφείλει να εκτελεστεί:

```ts
import { withJobContext } from '@cqrs-ddd/pipeline-job-context';
import { Queue } from 'bullmq';

@EventsHandler(UserCreatedEvent)
export class EnqueueWelcomeEmail implements IEventHandler<UserCreatedEvent> {
  constructor(private readonly queue: Queue) {}

  async handle(event: UserCreatedEvent): Promise<void> {
    await this.queue.add('welcome', withJobContext({ userId: event.userId }));
  }
}
```

Ο event handler εκτελείται εντός του correlation id και του tenant του command, επομένως το job
τα κληρονομεί αυτόματα.

## Εκτέλεση του job

Ο διακοσμητής `@InJobContext()` στη μέθοδο του worker επαναφέρει το context από το `job.data.jobContext`
πριν εκτελεστεί η μέθοδος: το tenant, το correlation id, και το principal μέσω του `restore()`.
Ένα command που εκτελείται από το job τρέχει το pipeline του ακριβώς όπως θα έτρεχε από το αρχικό αίτημα.
Η εφαρμογή εκκινεί τον worker και τον κλείνει κατά τον τερματισμό:

```ts
import { InJobContext, type WithJobContext } from '@cqrs-ddd/pipeline-job-context';
import { Worker, type Job } from 'bullmq';

export class WelcomeEmailWorker {
  private readonly worker: Worker;

  constructor(private readonly commands: CommandBus) {
    this.worker = new Worker('welcome', (job) => this.process(job), { connection });
  }

  close() {
    return this.worker.close();
  }

  @InJobContext()
  async process(job: Job<WithJobContext<{ userId: string }>>) {
    await this.commands.execute(new SendWelcomeEmailCommand(job.data.userId));
  }
}
```

Ένα payload χωρίς έγκυρο context, ή ένα που ορίζει tenant εκτός της λίστας `tenants`, ρίχνει
`InvalidJobContextError` και το job αποτυγχάνει χωρίς να εκτελεστεί.

## Προγραμματισμένες εργασίες (Scheduled work)

Εργασίες που δεν ξεκίνησαν από κάποιο αίτημα, όπως ένας νυχτερινός καθαρισμός, δεν έχουν principal
προς επαναφορά. Ο decorator `@AsSystem()` τις εκτελεί ως δηλωμένο service principal με τα δικαιώματα
(grants) που δηλώνει ο κώδικάς τους, μία φορά ανά καταχωρημένο tenant, με κάθε εκτέλεση να φέρει
το δικό της tenant και νέο correlation id:

```ts
import { AsSystem } from '@cqrs-ddd/pipeline-job-context';

export class SessionCleanup {
  constructor(private readonly commands: CommandBus) {}

  @AsSystem({
    principal: { id: 'session-cleanup', type: 'service' },
    grants: [{ action: 'delete', subject: 'Auth' }],
  })
  async purgeExpired() {
    await this.commands.execute(new PurgeExpiredSessionsCommand());
  }
}
```

Το `restore()` λαμβάνει τα δηλωμένα grants ως τρίτο όρισμα για αυτές τις εργασίες. Ένα tenant που
αποτυγχάνει δεν σταματά τα υπόλοιπα. Η μέθοδος στη συνέχεια απορρίπτεται με ένα `AggregateError`.
Τοποθετήστε το `@AsSystem` κάτω από τον scheduling decorator, ώστε το schedule να καλεί τη wrapped μέθοδο.
