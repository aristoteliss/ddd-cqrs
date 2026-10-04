---
title: "@cqrs-ddd/pipeline-job-context"
description: "Μεταφορά του tenant, correlation id και principal ενός αιτήματος στα queue jobs που δημιουργεί, και παροχή ρητού context σε system background work."
sidebar:
  order: 32
---

Η εκτέλεση background εργασιών χάνει το αρχικό context του αιτήματος που τις ξεκίνησε. Αυτό το πακέτο μεταφέρει το tenant, το correlation id και το principal ενός αιτήματος στα jobs που τοποθετούνται σε ουρά, και τα επαναφέρει όταν το job εκτελείται. Εργασίες που δεν ξεκίνησαν από αίτημα, όπως cron jobs, δηλώνουν το δικό τους ρητό context: ένα service principal, τα grants του και τα tenants στα οποία εκτελείται.

- Το `registerJobContext()`, μία φορά κατά την εκκίνηση, ρυθμίζει την προέλευση του context.
- Το `withJobContext(data)` επισυνάπτει το context στο payload του job κατά την εισαγωγή στην ουρά.
- Το `@InJobContext()` επαναφέρει το context στη μέθοδο του consumer.
- Το `@AsSystem()` εκτελεί system work μία φορά ανά tenant ως δηλωμένο service principal.

Και οι δύο decorators λειτουργούν στο standard mode και στο `experimentalDecorators` mode.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/pipeline-job-context
```

## Χρήση

```ts
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import {
  InJobContext,
  registerJobContext,
  withJobContext,
} from '@cqrs-ddd/pipeline-job-context';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

registerJobContext({
  principal: new SessionJobPrincipal(sessions),
  tenants: ['acme', 'globex'],
  sources: { tenantId: tenantSource, correlationId: correlationSource },
});

// Κατά την εισαγωγή στην ουρά (μέσα στο αίτημα):
await queue.add('welcome', withJobContext({ userId }));

// Κατά την εκτέλεση του job:
class WelcomeWorker {
  @InJobContext()
  async process(job: { data: { userId: string } }) {}
}
```

### Ενσωμάτωση NestJS (`@cqrs-ddd/nestjs`)

Σε εφαρμογές NestJS, χρησιμοποιήστε το `JobContextModule.forRoot()` από το `@cqrs-ddd/nestjs/job-context`:

```typescript
import { Module } from '@nestjs/common';
import { JobContextModule } from '@cqrs-ddd/nestjs/job-context';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';
import { SessionJobPrincipal } from './session-job-principal.service.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    JobContextModule.forRoot({
      imports: [AuthModule],
      principal: SessionJobPrincipal,
      tenants: () => ['tenant_a', 'tenant_b'],
      sources: { tenantId: tenantSource, correlationId: correlationSource },
    }),
  ],
})
export class AppModule {}
```

## Επιλογές

`registerJobContext(options)`:

| Επιλογή | Σημασία |
| --- | --- |
| `principal` | το `IJobPrincipal` της εφαρμογής: το `capture()` διαβάζει το τρέχον principal κατά το enqueue, το `restore(principal, work, grants?)` το επανελέγχει και εκτελεί το job ως αυτό |
| `tenants` | τα επιτρεπόμενα tenants (ένα job που αναφέρει άλλο tenant απορρίπτεται) |
| `sources` | από πού διαβάζονται και αποκαθίστανται το tenant και το correlation id (`tenantSource`, `correlationSource`) |

Το `@InJobContext({ path })` διαβάζει το context σε dot path του πρώτου ορίσματος της μεθόδου (προεπιλογή: `'data.jobContext'` για BullMQ).

## Εργασίες συστήματος (System work)

```ts
import { AsSystem } from '@cqrs-ddd/pipeline-job-context';

class Maintenance {
  @AsSystem({
    principal: { id: 'session-cleanup', type: 'service' },
    grants: [{ action: 'delete', subject: 'Auth' }],
  })
  async purgeSessions() {
    await purgeExpiredSessions();
  }
}
```

Η μέθοδος εκτελείται μία φορά ανά καταχωρημένο tenant, διαδοχικά, κάθε φορά με το δικό της tenant, νέο correlation id και το δηλωμένο principal και grants. Αν ένα tenant αποτύχει, τα υπόλοιπα συνεχίζουν κανονικά. Η μέθοδος στη συνέχεια απορρίπτει με `AggregateError`. Τοποθετήστε το `@AsSystem` κάτω από τον scheduling decorator.

## Ασφάλεια

Το payload μιας ουράς είναι μη αξιόπιστο (untrusted). Μεταφέρει μόνο την ταυτότητα του principal (`id`, `type`, `sessionId`), ποτέ τα permissions του. Το `restore()` επανελέγχει το principal κατά την εκτέλεση: ένα ανακληθέν session ή διαγραμμένος χρήστης απορρίπτει άμεσα το job. Το system work λαμβάνει grants αποκλειστικά από τη στατική του δήλωση.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-job-context/)
