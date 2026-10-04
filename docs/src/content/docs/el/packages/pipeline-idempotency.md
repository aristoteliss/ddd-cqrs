---
title: "@cqrs-ddd/pipeline-idempotency"
description: "Εκτέλεση ενός command μία φορά ανά κλειδί λειτουργίας, επιστροφή της αποθηκευμένης απάντησης σε διπλότυπες κλήσεις και απόρριψη επαναχρησιμοποίησης κλειδιού με διαφορετικό αίτημα."
sidebar:
  order: 13
---

Καθιστά την εκτέλεση commands idempotent σε κατανεμημένες υπηρεσίες. Ένα command εκτελείται ακριβώς μία φορά ανά κλειδί λειτουργίας. Διπλότυπες κλήσεις λαμβάνουν την αποθηκευμένη απάντηση χωρίς επανεκτέλεση παρενεργειών (side effects). Η επαναχρησιμοποίηση του ίδιου κλειδιού με τροποποιημένο payload απορρίπτεται με HTTP 422 Unprocessable Entity.

Περιλαμβάνει ενσωματωμένα stores για memory (testing), Redis και PostgreSQL με υποστήριξη επαλήθευσης replay ανά scope δικαιωμάτων.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/pipeline-idempotency @cqrs-ddd/pipeline
```

Τα stores δέχονται client που εγκαθιστά και συνδέει η εφαρμογή:
- Redis: node-redis client (`redis` 4 ή νεότερο)
- PostgreSQL: `pg` pool ή client

## Μηχανή κατάστασης & Κύκλος ζωής εκτέλεσης

Το `IdempotencyBehavior` συντονίζει τις καταστάσεις εκτέλεσης μέσω ατομικών λειτουργιών:

```text
Εισερχόμενο Command (Κλειδί = K)
         │
         ▼
Έλεγχος Store για Κλειδί K
         │
         ├─ Το κλειδί ΔΕΝ υπάρχει ──────────► Απόκτηση Lock (Κατάσταση: 'in_progress')
         │                                            │
         │                                            ▼
         │                                     Εκτέλεση Pipeline του Handler
         │                                            │
         │                                     Επιτυχία;
         │                                     ├─ Ναι: Αποθήκευση Απάντησης & Κατάσταση: 'completed'
         │                                     └─ Όχι:  Απελευθέρωση Κλειδιού (αν releaseOnError: true)
         │
         ├─ Το κλειδί υπάρχει & Κατάσταση είναι 'in_progress'
         │      └─► Απόρριψη με IdempotencyConflictError (reason: 'in_progress', HTTP 409)
         │
         └─ Το κλειδί υπάρχει & Κατάσταση είναι 'completed'
                │
                ├─ Το αποτύπωμα του payload ΔΕΝ ταιριάζει
                │      └─► Απόρριψη με IdempotencyConflictError (reason: 'key_reuse', HTTP 422)
                │
                ├─ Το digest του replay scope ΔΕΝ ταιριάζει
                │      └─► Απόρριψη με IdempotencyConflictError (reason: 'replay_scope', HTTP 409)
                │
                └─ Όλοι οι έλεγχοι περνούν
                       └─► Επιστροφή αποθηκευμένης απάντησης άμεσα (χωρίς εκτέλεση handler)
```

## Χρήση

### 1. Plain Node.js / Μηχανή Pipeline

```typescript
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  createPartitionedIdempotencyKeyFactory,
  IdempotencyBehavior,
  idempotent,
  RedisIdempotencyStore,
} from '@cqrs-ddd/pipeline-idempotency';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const pipeline = createPipeline({
  behaviors: [new IdempotencyBehavior(new RedisIdempotencyStore(redis))],
});

const paymentKey = createPartitionedIdempotencyKeyFactory({
  principal: (ctx) => ctx.items.get('userId') as string,
  operation: (ctx) => ctx.items.get('idempotencyKey') as string,
  onMissingOperation: 'skip',
  includeTenant: false,
});

export const chargePayment = pipeline.wrap(
  { name: 'chargePayment', kind: 'command' },
  idempotent({ keyFactory: paymentKey, ttl: 86_400_000 }),
)(async (payment: PaymentDto) => paymentGateway.charge(payment));
```

### 2. Standalone CQRS (`@cqrs-ddd/cqrs`)

```typescript
import { CommandHandler, ICommandHandler } from '@cqrs-ddd/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { idempotent } from '@cqrs-ddd/pipeline-idempotency';

@CommandHandler(CreateInvoiceCommand)
@UsePipeline(idempotent({ keyFactory: invoiceKeyFactory }))
export class CreateInvoiceHandler implements ICommandHandler<CreateInvoiceCommand> {
  async execute(command: CreateInvoiceCommand) {
    return this.invoices.create(command);
  }
}
```

### 3. NestJS (`@cqrs-ddd/nestjs`)

```typescript
import { Module } from '@nestjs/common';
import { IdempotencyBehavior, RedisIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';
import { RedisService } from './redis.service.js';

@Module({
  providers: [
    {
      provide: IdempotencyBehavior,
      inject: [RedisService],
      useFactory: (redis: RedisService) =>
        new IdempotencyBehavior(new RedisIdempotencyStore(redis.client)),
    },
  ],
  exports: [IdempotencyBehavior],
})
export class ReliabilityModule {}
```

## Αποθηκευτικά Backends

### Memory Store (`MemoryIdempotencyStore`)

Ιδανικό για unit tests και περιβάλλον ανάπτυξης ενός node:

```typescript
import { MemoryIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';

const store = new MemoryIdempotencyStore({
  cleanupIntervalMs: 60_000,
});

store.destroy();
```

### Redis Store (`RedisIdempotencyStore`)

Κατανεμημένο store έτοιμο για παραγωγή με χρήση ατομικών εντολών Redis:

```typescript
import { RedisIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';

const store = new RedisIdempotencyStore(redisClient, {
  keyPrefix: 'idemp:',
});
```

### PostgreSQL Store (`PostgresIdempotencyStore`)

Αποθηκεύει εγγραφές idempotency απευθείας στην PostgreSQL για συστήματα που απαιτούν σχεσιακή συνέπεια:

```typescript
import {
  PostgresIdempotencyStore,
  createIdempotencyTableSql,
} from '@cqrs-ddd/pipeline-idempotency';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(createIdempotencyTableSql('idempotency_keys'));

const store = new PostgresIdempotencyStore(pool, {
  table: 'idempotency_keys',
});
```

## Διαχωρισμός κλειδιών (Partitioned Keys)

Τα κλειδιά idempotency πρέπει να είναι αυστηρά απομονωμένα ανά tenant και principal προς αποφυγή επιθέσεων σύγκρουσης κλειδιών μεταξύ tenants ή χρηστών:

```typescript
const keyFactory = createPartitionedIdempotencyKeyFactory({
  principal: (ctx) => getUserId(ctx),
  operation: (ctx) => getHeader(ctx, 'idempotency-key'),
  onMissingOperation: 'throw',
  action: 'payments.charge',
  version: 'v1',
  includeTenant: true,
  requireTenant: true,
});
```

| Επιλογή Factory | Τύπος | Προεπιλογή | Περιγραφή |
| --- | --- | --- | --- |
| `principal` | `(ctx) => string \| string[] \| undefined` | υποχρεωτικό | Ταυτοποιεί τον καλούντα από αυθεντικοποιημένο context. Ρίχνει `MissingIdempotencyPartitionError` αν απουσιάζει. |
| `operation` | `(ctx) => string \| undefined` | υποχρεωτικό | Μοναδικό αναγνωριστικό λειτουργίας πελάτη (π.χ. από επικεφαλίδα `Idempotency-Key`). |
| `onMissingOperation` | `'throw' \| 'skip'` | `'throw'` | Με `'throw'`, αιτήματα χωρίς id αποτυγχάνουν άμεσα. Με `'skip'`, εκτελούνται χωρίς παρακολούθηση idempotency. |
| `action` | `string` | `ctx.requestName` | Λογικό όνομα λειτουργίας ενσωματωμένο στο κλειδί. |
| `version` | `string` | `undefined` | Αρχικό τμήμα namespace. Αλλαγή του ακυρώνει όλες τις αποθηκευμένες εγγραφές. |
| `includeTenant` | `boolean` | `true` | Προσαρτά το ενεργό tenant ID στο κλειδί. |
| `requireTenant` | `boolean` | `includeTenant` | Ρίχνει `MissingIdempotencyPartitionError` αν λείπει το tenant. |

Μορφή παραγόμενου κλειδιού:
```text
[version:]<tenantId>:<principal…>:<action>:<operation>
```

## Ασφάλεια & Επαλήθευση Scope στο Replay

Ένα cache ή idempotency hit επιστρέφει αποθηκευμένα δεδομένα χωρίς να καλέσει τον handler ή τους εσωτερικούς ελέγχους δικαιωμάτων οντοτήτων.

Για να αποτρέψετε αναβάθμιση προνομίων (privilege escalation) όταν τα δικαιώματα αλλάζουν μεταξύ αιτημάτων, δηλώστε `replayScopeFactory`:

```typescript
import { abilityDigest } from '@cqrs-ddd/pipeline-casl';

idempotent({
  keyFactory,
  replayScopeFactory: abilityDigest,
  ttl: 86_400_000,
});
```

Αν τα δικαιώματα του καλούντος έχουν αλλάξει μεταξύ της αρχικής εκτέλεσης και του διπλότυπου αιτήματος, το αποθηκευμένο digest δεν θα ταιριάζει. Το αίτημα απορρίπτεται με `IdempotencyConflictError` (`reason: 'replay_scope'`, HTTP 409 Conflict) αντί να επιστραφούν μη εξουσιοδοτημένα δεδομένα.

## Επιλογές παραμετροποίησης

| Επιλογή | Τύπος | Προεπιλογή | Περιγραφή |
| --- | --- | --- | --- |
| `keyFactory` | `IdempotencyKeyFactory` | υποχρεωτικό | Συνάρτηση παραγωγής του string κλειδιού. |
| `ttl` | `number` | `86_400_000` (24h) | Χρόνος ζωής των ολοκληρωμένων εγγραφών σε milliseconds. |
| `scope` | `DeclaredKind[]` | `['command']` | Είδη αιτημάτων στα οποία εφαρμόζεται το behavior. |
| `fingerprint` | `boolean` | `true` | Συγκρίνει SHA-256 hash του request payload. Αναντιστοιχία ρίχνει `key_reuse` (422). |
| `replayScopeFactory` | `IdempotencyReplayScopeFactory` | `undefined` | Υπολογίζει digest εξουσιοδότησης για ασφαλές replay. |
| `releaseOnError` | `boolean` | `true` | Διαγράφει το εκκρεμές lock όταν ο handler αποτυγχάνει, επιτρέποντας άμεση επανάληψη. |

## HTTP αντιστοίχιση σφαλμάτων

Το `IdempotencyConflictError` αντιστοιχίζεται σε HTTP απαντήσεις μέσω του `@cqrs-ddd/pipeline-idempotency/http`:

| Αιτία διένεξης (Conflict Reason) | HTTP Status | Περιγραφή |
| --- | --- | --- |
| `in_progress` | 409 Conflict | Μια εκτέλεση με το ίδιο κλειδί βρίσκεται ακόμη σε εξέλιξη. |
| `replay_scope` | 409 Conflict | Η αποθηκευμένη απάντηση εξουσιοδοτήθηκε υπό διαφορετικό scope δικαιωμάτων. |
| `key_reuse` | 422 Unprocessable Entity | Το ίδιο κλειδί στάλθηκε με διαφορετικό payload. |

Σε εφαρμογές NestJS με `@cqrs-ddd/nestjs`, το `ErrorFilter` αντιστοιχίζει αυτά τα σφάλματα αυτόματα.

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-idempotency/)
