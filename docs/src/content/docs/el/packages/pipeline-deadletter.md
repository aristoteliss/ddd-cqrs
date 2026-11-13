---
title: "@cqrs-ddd/pipeline-deadletter"
description: "Καταγραφή αποτυχημένων λειτουργιών μαζί με το request, σφάλμα, tenant και correlation id, και επαναπροώθησή τους (redrive) αργότερα."
sidebar:
  order: 18
---
[![npm version](https://img.shields.io/npm/v/@cqrs-ddd/pipeline-deadletter.svg)](https://www.npmjs.com/package/@cqrs-ddd/pipeline-deadletter)
[![npm downloads](https://img.shields.io/npm/dm/@cqrs-ddd/pipeline-deadletter.svg)](https://www.npmjs.com/package/@cqrs-ddd/pipeline-deadletter)
[![Node.js](https://img.shields.io/node/v/@cqrs-ddd/pipeline-deadletter.svg)](https://www.npmjs.com/package/@cqrs-ddd/pipeline-deadletter)
[![License](https://img.shields.io/badge/license-AGPL--3.0%20%7C%20commercial-blue.svg)](https://github.com/aristoteliss/ddd-cqrs#license-and-commercial-use)

Καταγράφει μια αποτυχημένη λειτουργία ως dead letter: το αίτημα, το σφάλμα, το tenant και το correlation id της, αποστέλλοντάς τα σε ένα transport (BullMQ, RabbitMQ ή PostgreSQL). Εξ ορισμού καταγράφονται μόνο events, καθώς ο καλών ενός command ή query λαμβάνει ήδη το σφάλμα. Το `DeadLetterRedriver` εκτελεί ένα καταγεγραμμένο αίτημα εκ νέου αργότερα.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/pipeline-deadletter @cqrs-ddd/pipeline
```

Κάθε transport δέχεται client του αντίστοιχου broker ή βάσης δεδομένων (`bullmq` queue, `amqplib` confirm channel, `pg` pool).

## Χρήση

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  DeadLetterBehavior,
  deadLetter,
  PostgresDeadLetterTransport,
} from '@cqrs-ddd/pipeline-deadletter';

const transport = new PostgresDeadLetterTransport(pool);
const pipeline = createPipeline({ behaviors: [new DeadLetterBehavior(transport)] });

export const onUserCreated = pipeline.wrap(
  { name: 'onUserCreated', kind: 'event' },
  deadLetter({ rethrow: false, redactKeys: ['refreshToken'] }),
)(async (event: UserCreatedEvent) => mailer.sendWelcome(event.email));
```

## Transports

| Transport | Σημειώσεις |
| --- | --- |
| `BullMqDeadLetterTransport` | προσθέτει κάθε dead letter ως job σε ουρά BullMQ (προεπιλογή: `dead-letter`) |
| `RabbitMqDeadLetterTransport` | δημοσιεύει στο RabbitMQ μέσω confirm channel |
| `PostgresDeadLetterTransport` | εισάγει σε πίνακα (προεπιλογή: `dead_letters`). Αποτελεί επίσης `DeadLetterStore`, απαραίτητο για το redrive |

Οποιοδήποτε άλλο backend υλοποιεί το interface `DeadLetterTransport`: `send(record)`.

## Επιλογές

| Επιλογή | Σημασία | Προεπιλογή |
| --- | --- | --- |
| `captureKinds` | είδη αιτημάτων που καταγράφονται | `['event']` |
| `rethrow` | επανέγερση του σφάλματος μετά την καταγραφή. Με `false` το αποσιωπά (μόνο σε events) | `true` |
| `ignoreErrors` | κλάσεις σφαλμάτων ή συνάρτηση ελέγχου για σφάλματα που δεν καταγράφονται (π.χ. validation) | κανένα |
| `redactKeys` | πεδία που καλύπτονται στο καταγεγραμμένο payload | κανένα |
| `redact` | συνάρτηση που αντικαθιστά την προεπιλεγμένη κάλυψη payload | κανένα |
| `metadata` | συνάρτηση που επιστρέφει πρόσθετα πεδία | κανένα |
| `includeStack` | συμπερίληψη του stack trace | `true` |

## Σειρά τοποθέτησης (Ordering)

Τοποθετήστε το behavior **έξω** από retries (ώστε να καταγράφει αποτυχία μόνο μετά την εξάντλησή τους), και **μέσα** από το validation (ώστε αναμενόμενα validation errors να μην καταγράφονται).

## Επαναπροώθηση (Redriving)

```ts
import { DeadLetterRedriver } from '@cqrs-ddd/pipeline-deadletter';

const redriver = new DeadLetterRedriver(transport, {
  requestTypes: [UserCreatedEvent],
  dispatch: {
    event: (event, record) => eventHandlers[record.handlerName](event),
  },
});

await redriver.redrive(recordId);
```

Το redriver ανακατασκευάζει το αίτημα από την εγγραφή, αντιστοιχίζοντας το `record.requestName` με τα ονόματα των κλάσεων στο `requestTypes`, το δρομολογεί, και επισημαίνει την εγγραφή ως επιλυμένη.

Πριν από τη δρομολόγηση, το redriver δεσμεύει την εγγραφή στο store. Ένα δεύτερο redrive της ίδιας εγγραφής, από την ίδια ή από άλλη διεργασία, απορρίπτεται με `DeadLetterRedriveError` και δεν δρομολογεί τίποτα. Η δέσμευση λήγει όταν τελειώσει το redrive. Αν η διεργασία σταματήσει κατά την εκτέλεση, η δέσμευση λήγει μετά από `leaseMs` (προεπιλογή: πέντε λεπτά)· ορίστε το `leaseMs` μεγαλύτερο από την πιο αργή εκτέλεση.

Το `PostgresDeadLetterTransport` κρατά τη δέσμευση στη στήλη `claimed_until` και το tenant του αποτυχημένου αιτήματος στη στήλη `tenant_id`. Εκτελέστε ξανά το `createDeadLetterTableSql()` για να προστεθούν οι στήλες σε πίνακα που δεν τις έχει. Το `list({ tenantId })` επιστρέφει τις εγγραφές ενός tenant.

Η συνάρτηση dispatch εκτελείται στο context αυτού που καλεί το `redrive`. Όταν ο handler διαβάζει το tenant, επαναφέρετε το `record.tenantId` μέσα στη συνάρτηση dispatch πριν ξεκινήσει η εκτέλεση.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-deadletter/)
