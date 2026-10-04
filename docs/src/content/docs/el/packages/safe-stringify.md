---
title: "@cqrs-ddd/safe-stringify"
description: "Ντετερμινιστικό JSON για ταυτότητα (cache keys, αποτυπώματα) και ασφαλές JSON με απόκρυψη ευαίσθητων δεδομένων για logs, χωρίς εξαρτήσεις και χωρίς framework."
editUrl: false
sidebar:
  order: 50
---

Δύο serializers JSON με αντίθετους στόχους, και helpers τμημάτων κλειδιών για τη δημιουργία κλειδιών ταυτότητας. Χωρίς runtime εξαρτήσεις και χωρίς framework.

| | Strict: `stableStringify`, `toStrictJsonValue` | Safe: `safeStringify`, `safeSanitize`, `redactValue` |
| --- | --- | --- |
| Χρήση | Ταυτότητα: cache keys, αποτυπώματα idempotency, αποθηκευμένα snapshots | Εμφάνιση: logs, καταγραφές audit και dead-letter payloads |
| Έξοδος | Ντετερμινιστικό JSON, ταξινομημένα κλειδιά σε κάθε επίπεδο, σταθερό μεταξύ εκδόσεων | Αναγνώσιμο JSON κατά σειρά εισαγωγής. Η μορφή μπορεί να εξελιχθεί |
| Μη υποστηριζόμενη είσοδος | Ρίχνει `TypeError` | Δεν ρίχνει ποτέ σφάλμα |
| Μυστικά (Secrets) | Δεν αποκρύπτει ποτέ (ένα κλειδί δεν επιτρέπεται να αλλάξει) | Εξαιρεί και αποκρύπτει κατόπιν αιτήματος |

**Χρησιμοποιήστε τον strict serializer για οτιδήποτε ταυτοποιεί δεδομένα. Μην χρησιμοποιείτε ποτέ το `safeStringify` για κλειδί ή αποτύπωμα:** η έξοδός του δεν είναι ταξινομημένη, αντικαθιστά τιμές που δεν μπορεί να αναπαραστήσει, και η μορφή του μπορεί να αλλάξει.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/safe-stringify
```

Απαιτεί Node.js 22.12 ή νεότερο.

## Strict Serializer

```typescript
import { stableStringify, toStrictJsonValue } from '@cqrs-ddd/safe-stringify';

stableStringify({ z: 1, a: { d: 2, c: new Date(0) } });
// '{"a":{"c":"1970-01-01T00:00:00.000Z","d":2},"z":1}'

toStrictJsonValue({ b: 2, a: 1 }, true); // { a: 1, b: 2 }, αντικείμενο με null prototype
```

- Strings, booleans, `null` και πεπερασμένοι αριθμοί διατηρούνται. Ημερομηνίες γίνονται ISO-8601 strings. Αντικείμενα με `toJSON()` αντικαθίστανται από την επιστρεφόμενη τιμή.
- Οτιδήποτε άλλο ρίχνει `TypeError`: `undefined`, συναρτήσεις, `bigint`, symbols, μη πεπερασμένοι αριθμοί, κυκλικές αναφορές, sparse arrays, `Map`, `Set`, `Error`, `RegExp` κ.ά.
- Δομικά ισοδύναμες τιμές παράγουν πανομοιότυπα strings, ανεξαρτήτως της σειράς εισαγωγής των ιδιοτήτων. Τα κλειδιά ταξινομούνται κατά UTF-16 code unit.

## Safe Serializer

```typescript
import {
  DEFAULT_REDACT_KEYS,
  redactValue,
  safeStringify,
} from '@cqrs-ddd/safe-stringify';

const payload: Record<string, unknown> = { user: 'jane', password: 'secret', amount: 10n };
payload.self = payload;

safeStringify(payload);
// '{"user":"jane","password":"secret","amount":"[bigint]","self":"[Circular]"}'

safeStringify(payload, { redactKeys: DEFAULT_REDACT_KEYS });
// '{"user":"jane","password":"[REDACTED]","amount":"[bigint]","self":"[Circular]"}'

redactValue(payload); // βαθύ αντίγραφο με καλυμμένα τα DEFAULT_REDACT_KEYS
```

- Τα `safeStringify(value, options?, indent?)` και `safeSanitize(value, options?)` δεν ρίχνουν ποτέ σφάλμα. Κύκλοι γίνονται `"[Circular]"`, σφάλματα επεκτείνονται σε `name`, `message`, `stack`, και μη υποστηριζόμενες τιμές αντικαθίστανται από αναγνώσιμους δείκτες (`"[bigint]"`, `"[Function]"`).
- **Δεν αποκρύπτουν τίποτα εκτός αν περάσετε `redactKeys`.** Το `redactValue(value, keys?)` εφαρμόζει `DEFAULT_REDACT_KEYS` εξ ορισμού.

## Τμήματα κλειδιών (Key segments)

```typescript
import {
  ABSENT_SEGMENT,
  escapeKeySegment,
  joinKeySegments,
} from '@cqrs-ddd/safe-stringify';

joinKeySegments(['cache', 'tenant:a', undefined, 'user']);
// 'cache:tenant\\:a:\\-:user'
```

- Το `joinKeySegments(segments)` κάνει escape κάθε τμήμα και τα ενώνει με `:`. Τα `undefined` και `null` γίνονται `ABSENT_SEGMENT` (`\-`).
- Το `escapeKeySegment(value)` κάνει escape πρώτα το `\` και μετά το `:`.

Κατασκευή cache key:

```typescript
import { joinKeySegments, stableStringify } from '@cqrs-ddd/safe-stringify';
import { createHash } from 'node:crypto';

function cacheKey(tenantId: string | undefined, name: string, payload: unknown): string {
  const fingerprint = createHash('sha256').update(stableStringify(payload)).digest('hex');
  return joinKeySegments(['cache', tenantId, name, fingerprint]);
}
```

## Άδεια χρήσης

Διπλή άδεια υπό **AGPLv3** και **Commercial License**. Δείτε τα αρχεία [`LICENSE`](https://github.com/aristoteliss/ddd-cqrs/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/ddd-cqrs/blob/master/COMMERCIAL_LICENSE.txt) στη ρίζα του repository.
