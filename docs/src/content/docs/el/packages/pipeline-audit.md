---
title: "@cqrs-ddd/pipeline-audit"
description: "Εγγραφές audit για το ποιος έκανε τι, σε ποιο tenant και correlation, με ποια έκβαση και με απόκρυψη ευαίσθητων δεδομένων."
sidebar:
  order: 17
---

Καταγράφει μια εγγραφή ελέγχου (audit record) για κάθε λειτουργία: ποιος έκανε τι, σε ποιο tenant και correlation, με ποιο αποτέλεσμα και πόση διάρκεια είχε, με το request (και προαιρετικά το response) καλυμμένο ως προς τα ευαίσθητα δεδομένα (redacted). Το behavior εξαρτάται αποκλειστικά από το interface `AuditSink`. Το `LogAuditSink` γράφει σε logger και το `PostgresAuditSink` σε πίνακα βάσης δεδομένων.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/pipeline-audit @cqrs-ddd/pipeline
```

Το `PostgresAuditSink` δέχεται ένα `pg` pool ή client, το οποίο εγκαθιστά η εφαρμογή.

## Χρήση

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import { AuditBehavior, audit, LogAuditSink } from '@cqrs-ddd/pipeline-audit';

const pipeline = createPipeline({
  behaviors: [new AuditBehavior(new LogAuditSink())],
  globalBehaviors: { scope: 'commands', before: [AuditBehavior] },
});

export const deleteUser = pipeline.wrap(
  { name: 'deleteUser', kind: 'command' },
  audit({
    action: 'user.delete',
    severity: 'high',
    actor: (ctx) => ({ id: ctx.items.get('currentUserId') as string }),
  }),
)(async (id: string) => users.remove(id));
```

Ο constructor του behavior δέχεται το sink, προαιρετικές προεπιλογές για κάθε λειτουργία και έναν προαιρετικό logger.

## Η εγγραφή (Audit record)

Ένα `AuditRecord` περιλαμβάνει `id`, τα `correlationId` και `tenantId`, το `action`, το `severity`, την έκβαση `outcome` (`'success'`, `'failure'` ή `'pending'`), το `actor`, το είδος και τα ονόματα του αιτήματος, τα καλυμμένα `payload` και `response`, το `error` σε αποτυχία, το `durationMs`, ένα `timestamp` και προαιρετικά `metadata`.

Ένα sink που υλοποιεί το `begin(record)` λαμβάνει μια εγγραφή `'pending'` πριν εκτελεστεί η λειτουργία, και το `write(record)` την αντικαθιστά με την τελική υπό το ίδιο id, διατηρώντας ορατή μια προσπάθεια που διακόπηκε από τερματισμό της διεργασίας.

## Sinks

| Sink | Σημειώσεις |
| --- | --- |
| `LogAuditSink` | γράφει κάθε εγγραφή σε έναν logger (προεπιλογή: `console`). Το `{ pretty: true }` μορφοποιεί το αποτέλεσμα |
| `PostgresAuditSink` | εισάγει σε πίνακα (προεπιλογή: `audit_log`). Δημιουργήστε τον μία φορά με το `createAuditTableSql()` |

Οποιοδήποτε άλλο backend υλοποιεί το interface `AuditSink`: `write(record)`, και προαιρετικά `begin(record)`.

## Επιλογές

| Επιλογή | Σημασία | Προεπιλογή |
| --- | --- | --- |
| `action` | η καταγεγραμμένη ενέργεια | `context.requestName` |
| `severity` | `'low'`, `'medium'`, `'high'` ή `'critical'` | `'medium'`, ή `'low'` για queries |
| `actor` | συνάρτηση που επιστρέφει το ενεργό principal | κανένα |
| `captureKinds` | είδη αιτημάτων που καταγράφονται | `['command']` |
| `captureRequest` | καταγραφή του καλυμμένου request | `true` |
| `captureResponse` | καταγραφή του καλυμμένου response | `false` |
| `redactKeys` | ονόματα πεδίων που καλύπτονται ως `[REDACTED]`, επιπλέον των προεπιλεγμένων (`password`, `token`, `secret`, …) | μόνο τα προεπιλεγμένα |
| `redact` | συνάρτηση που αντικαθιστά την προεπιλεγμένη κάλυψη | κανένα |
| `metadata` | συνάρτηση που επιστρέφει πρόσθετα πεδία για την εγγραφή | κανένα |
| `recordStart` | εγγραφή του `'pending'` record σε sink που υλοποιεί το `begin` | `true` |
| `includeStack` | συμπερίληψη του stack trace σε εγγραφές αποτυχίας | `true` |
| `failOpen` | αν η κατασκευή ή εγγραφή του audit αποτύχει, επιτρέπει σε μια επιτυχή λειτουργία να ολοκληρωθεί | `true` |

Ένα σφάλμα της ίδιας της λειτουργίας ρίχνεται πάντοτε αναλλοίωτο. Με `failOpen: false`, μια αποτυχημένη εγγραφή audit αποτυγχάνει ολόκληρη τη λειτουργία.

## Σειρά τοποθέτησης (Ordering)

Τοποθετήστε το audit behavior κοντά στο εξωτερικό μέρος της αλυσίδας, όπως στο `globalBehaviors.before`, ώστε η μέτρηση διάρκειας να καλύπτει ολόκληρη τη λειτουργία, και μετά το behavior που ταυτοποιεί τον καλούντα, ώστε η συνάρτηση `actor` να έχει πρόσβαση σε αυτόν.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-audit/)
