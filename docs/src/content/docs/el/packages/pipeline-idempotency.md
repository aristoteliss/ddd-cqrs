---
title: "@cqrs-ddd/pipeline-idempotency"
description: "Αποφυγή διπλότυπων commands ανά κλειδί λειτουργίας, επιστροφή της αποθηκευμένης απάντησης ενός ολοκληρωμένου και απόρριψη επαναχρησιμοποίησης κλειδιού με διαφορετικό αίτημα."
sidebar:
  order: 13
---

Αποτρέπει τα διπλότυπα commands ανά κλειδί λειτουργίας. Όσο η εγγραφή ενός κλειδιού είναι ενεργή, μια δεύτερη κλήση με το ίδιο κλειδί δεν εκτελεί τον handler: λαμβάνει την αποθηκευμένη απάντηση όταν η πρώτη κλήση έχει ολοκληρωθεί, και απορρίπτεται με HTTP 409 Conflict όσο η πρώτη κλήση εκτελείται ακόμη. Η επαναχρησιμοποίηση του ίδιου κλειδιού με τροποποιημένο payload απορρίπτεται με HTTP 422 Unprocessable Entity.

Πρόκειται για αποφυγή διπλοτύπων μέσα στη διάρκεια ζωής μιας εγγραφής, όχι για εκτέλεση ακριβώς μία φορά (exactly-once): η ενότητα [Εγγυήσεις και όρια](#εγγυήσεις-και-όρια) απαριθμεί πότε ένας handler μπορεί να εκτελεστεί ξανά για το ίδιο κλειδί.

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
Ατομική δέσμευση του Κλειδιού K (Κατάσταση: 'in_progress', λήγει μετά από ttl)
         │
         ├─ Δεσμεύτηκε ─────────────────────► Εκτέλεση Pipeline του Handler
         │                                            │
         │                                     Επιτυχία;
         │                                     ├─ Ναι: Αποθήκευση Απάντησης & Κατάσταση: 'completed' (λήγει μετά από ttl)
         │                                     └─ Όχι:  Απελευθέρωση Κλειδιού (αν releaseOnError: true)
         │
         └─ Υπάρχει ενεργή εγγραφή για το Κλειδί K
                │
                ├─ Το όνομα του αιτήματος ή το αποτύπωμα του payload ΔΕΝ ταιριάζει
                │      └─► Απόρριψη με IdempotencyConflictError (reason: 'key_reuse', HTTP 422)
                │
                ├─ Κατάσταση είναι 'in_progress'
                │      └─► Απόρριψη με IdempotencyConflictError (reason: 'in_progress', HTTP 409)
                │
                ├─ Κατάσταση είναι 'completed' & Το digest του replay scope ΔΕΝ ταιριάζει
                │      └─► Απόρριψη με IdempotencyConflictError (reason: 'replay_scope', HTTP 409)
                │
                └─ Κατάσταση είναι 'completed' & Όλοι οι έλεγχοι περνούν
                       └─► Επιστροφή αποθηκευμένης απάντησης άμεσα (χωρίς εκτέλεση handler)
```

## Εγγυήσεις και όρια

Με store του οποίου η δέσμευση είναι ατομική, όπως τα τρία ενσωματωμένα stores, το behavior εγγυάται ότι:

- Από πολλές κλήσεις με το ίδιο κλειδί, όσο η εγγραφή του είναι ενεργή, μία εκτελεί τον handler. Οι υπόλοιπες απορρίπτονται με `in_progress` όσο εκείνη εκτελείται και λαμβάνουν την αποθηκευμένη απάντησή της μόλις ολοκληρωθεί.
- Μια ολοκληρωμένη απάντηση επιστρέφεται ξανά μέχρι να λήξει η εγγραφή της, `ttl` μετά την ολοκλήρωση.
- Μόνο η εκτέλεση που κατέχει μια δέσμευση την ολοκληρώνει ή την απελευθερώνει, ώστε μια εκτέλεση που ξεπερνά τη διάρκεια της δέσμευσής της να μην αντικαθιστά ούτε να διαγράφει ποτέ μια νεότερη.

Δεν εγγυάται ότι ο handler εκτελείται μία φορά. Ο handler μπορεί να εκτελεστεί ξανά για το ίδιο κλειδί όταν:

- **Λήγει η εγγραφή.** Το `ttl` ορίζει τη διάρκεια τόσο της δέσμευσης σε εξέλιξη όσο και της ολοκληρωμένης εγγραφής. Ένας handler που εκτελείται περισσότερο από το `ttl` χάνει τη δέσμευσή του, και η επόμενη κλήση με το κλειδί εκτελεί τον handler δεύτερη φορά· η πρώτη εκτέλεση επιστρέφει κανονικά το αποτέλεσμά της, με το `IDEMPOTENCY_OWNERSHIP_LOST_ITEM` ορισμένο στο context. Μια διεργασία που σταματά κατά τη διάρκεια του handler αφήνει πίσω τη δέσμευσή της: οι επαναλήψεις απορρίπτονται με `in_progress` μέχρι να λήξει η δέσμευση, και η πρώτη επανάληψη μετά τη λήξη εκτελεί ξανά τον handler.
- **Ο handler αποτυγχάνει.** Με `releaseOnError: true` η δέσμευση διαγράφεται και μια επανάληψη εκτελεί ξανά τον handler, μαζί με ό,τι έκανε η αποτυχημένη προσπάθεια πριν αποτύχει. Με `false` η δέσμευση παραμένει μέχρι να λήξει και οι επαναλήψεις απορρίπτονται με `in_progress`.
- **Η απάντηση δεν μπορεί να αποθηκευτεί.** Όταν ο handler επιτυγχάνει αλλά η απάντησή του δεν είναι serializable, ή το store απορρίπτει την εγγραφή, η κλήση ρίχνει `IdempotencyCompletionError` με `executionSucceeded: true` και `phase` `'snapshot'` ή `'store'`. Οι παρενέργειες έχουν συμβεί και δεν έχει αποθηκευτεί απάντηση: μια επανάληψη απορρίπτεται με `in_progress` όσο η δέσμευση είναι ενεργή και εκτελεί ξανά τον handler μετά τη λήξη της.
- **Το store χάνει την εγγραφή ή δεν είναι κοινόχρηστο.** Το `MemoryIdempotencyStore` αποτρέπει διπλότυπα μέσα σε μία διεργασία και ξεχνά κάθε εγγραφή όταν η διεργασία σταματήσει. Πολλά instances χρειάζονται store στο οποίο έχουν όλα πρόσβαση, και οι παραπάνω εγγυήσεις είναι τόσο ανθεκτικές όσο το store αυτό.

Η εγγραφή και οι παρενέργειες του handler είναι ξεχωριστές εγγραφές: το behavior δεν τις τοποθετεί σε μία συναλλαγή (transaction), με κανένα store. Μια παρενέργεια που δεν πρέπει να επαναληφθεί χρειάζεται επομένως δική της προστασία. Περάστε ένα σταθερό αναγνωριστικό λειτουργίας σε εξωτερικό πάροχο που αποτρέπει διπλότυπα βάσει αυτού, όπως κάνει το παράδειγμα πληρωμής παρακάτω, ή κάντε την εγγραφή του ίδιου του handler να εξαρτάται από αυτό το αναγνωριστικό.

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
  operation: (ctx) => (ctx.request as PaymentDto).operationId,
  includeTenant: false,
});

export const chargePayment = pipeline.wrap(
  { name: 'chargePayment', kind: 'command' },
  idempotent({ keyFactory: paymentKey, ttl: 86_400_000 }),
)(async (payment: PaymentDto) =>
  paymentGateway.charge(payment, { idempotencyKey: payment.operationId }),
);
```

Το αναγνωριστικό λειτουργίας περνά και στον πάροχο πληρωμών. Η εγγραφή του pipeline από μόνη της δεν αποτρέπει δεύτερη χρέωση μετά από διεργασία που σταμάτησε ή δέσμευση που έληξε· την αποτρέπει ο έλεγχος διπλοτύπων του ίδιου του παρόχου πάνω στο ίδιο αναγνωριστικό.

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

Ιδανικό για unit tests και περιβάλλον ανάπτυξης ενός node. Οι εγγραφές ζουν μέσα στη διεργασία και χάνονται όταν αυτή σταματήσει:

```typescript
import { MemoryIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';

const store = new MemoryIdempotencyStore({
  cleanupIntervalMs: 60_000,
});

store.destroy();
```

### Redis Store (`RedisIdempotencyStore`)

Μοιράζεται τις εγγραφές μεταξύ instances, με χρήση ατομικών εντολών Redis:

```typescript
import { RedisIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';

const store = new RedisIdempotencyStore(redisClient, {
  keyPrefix: 'idemp:',
});
```

### PostgreSQL Store (`PostgresIdempotencyStore`)

Μοιράζεται τις εγγραφές μεταξύ instances σε πίνακα της PostgreSQL, χωρίς ξεχωριστό Redis. Το store εκτελεί τα δικά του statements· μια εγγραφή δεν γράφεται μέσα στη συναλλαγή του handler:

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
| `ttl` | `number` | `86_400_000` (24h) | Διάρκεια ζωής σε milliseconds της δέσμευσης σε εξέλιξη και, με επανεκκίνηση κατά την ολοκλήρωση, της ολοκληρωμένης εγγραφής. Ορίστε το μεγαλύτερο από την πιο αργή εκτέλεση. |
| `scope` | `DeclaredKind[]` | `['command']` | Είδη αιτημάτων στα οποία εφαρμόζεται το behavior. |
| `fingerprint` | `boolean` | `true` | Συγκρίνει SHA-256 hash του request payload. Αναντιστοιχία ρίχνει `key_reuse` (422). |
| `replayScopeFactory` | `IdempotencyReplayScopeFactory` | `undefined` | Υπολογίζει digest εξουσιοδότησης για ασφαλές replay. |
| `releaseOnError` | `boolean` | `true` | Διαγράφει τη δέσμευση όταν ο handler αποτυγχάνει, ώστε μια επανάληψη να εκτελέσει ξανά τον handler. Με `false` η δέσμευση παραμένει μέχρι να λήξει. |

## HTTP αντιστοίχιση σφαλμάτων

Το `IdempotencyConflictError` αντιστοιχίζεται σε HTTP απαντήσεις μέσω του `@cqrs-ddd/pipeline-idempotency/http`:

| Αιτία διένεξης (Conflict Reason) | HTTP Status | Περιγραφή |
| --- | --- | --- |
| `in_progress` | 409 Conflict | Μια εκτέλεση με το ίδιο κλειδί βρίσκεται ακόμη σε εξέλιξη. |
| `replay_scope` | 409 Conflict | Η αποθηκευμένη απάντηση εξουσιοδοτήθηκε υπό διαφορετικό scope δικαιωμάτων. |
| `key_reuse` | 422 Unprocessable Entity | Το ίδιο κλειδί στάλθηκε με διαφορετικό payload. |

Το `IdempotencyCompletionError` δεν έχει αντιστοίχιση σε HTTP: ο handler πέτυχε και η απάντησή του δεν αποθηκεύτηκε, οπότε η εφαρμογή αποφασίζει πώς θα απαντήσει στον καλούντα και αν απαιτείται έλεγχος συμφωνίας (reconciliation).

Σε εφαρμογές NestJS με `@cqrs-ddd/nestjs`, το `ErrorFilter` αντιστοιχίζει αυτά τα σφάλματα αυτόματα.

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-idempotency/)
