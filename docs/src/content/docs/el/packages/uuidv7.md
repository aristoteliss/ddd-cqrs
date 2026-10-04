---
title: "@cqrs-ddd/uuidv7"
description: "Παραγωγή και επικύρωση αναγνωριστικών RFC 9562 UUID έκδοσης 7, χωρίς εξαρτήσεις και χωρίς framework."
editUrl: false
sidebar:
  order: 52
---

Παράγει και επικυρώνει αναγνωριστικά UUID version 7 όπως ορίζονται από το [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562). Δεν έχει runtime εξαρτήσεις και κανένα framework: χρησιμοποιεί αποκλειστικά το ενσωματωμένο `crypto.randomBytes()` του Node.

Το UUIDv7 τοποθετεί ένα Unix timestamp σε milliseconds στα αρχικά bits, επομένως αναγνωριστικά που δημιουργούνται σε διαφορετικά milliseconds ταξινομούνται κατά χρόνο δημιουργίας ως απλά strings. Αυτό τα καθιστά ιδανικά για πρωτεύοντα κλειδιά βάσεων δεδομένων, αναγνωριστικά γεγονότων (event IDs) και correlation IDs.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/uuidv7
```

Απαιτεί Node.js 22.12 ή νεότερο.

## API

```typescript
import { isUuidV7, uuidv7 } from '@cqrs-ddd/uuidv7';

const id = uuidv7(); // π.χ. '01923456-789a-7c3d-9e4f-0123456789ab'

isUuidV7(id); // true
isUuidV7(`  ${id}\n`); // true: τα κενά γύρω από το string αγνοούνται
isUuidV7('00000000-0000-4000-8000-000000000000'); // false: version 4
isUuidV7(42); // false
```

| Export | Signature | Περιγραφή |
| --- | --- | --- |
| `uuidv7` | `() => string` | Νέο UUIDv7 στην κανονική μορφή 8-4-4-4-12 με πεζά γράμματα |
| `isUuidV7` | `(value: unknown) => value is string` | `true` για string που είναι έγκυρο UUIDv7 μετά από αφαίρεση κενών (trim) |

## Εγγυήσεις format

Κάθε αναγνωριστικό είναι 128 bits, γραμμένο ως 36 δεκαεξαδικοί χαρακτήρες και παύλες:

| Bits | Πεδίο | Περιεχόμενο |
| --- | --- | --- |
| 0–47 | `unix_ts_ms` | `Date.now()`, χρόνος Unix σε milliseconds |
| 48–51 | `ver` | `0111` (έκδοση 7) |
| 52–63 | `rand_a` | κρυπτογραφικά τυχαίο |
| 64–65 | `var` | `10` (η παραλλαγή RFC 9562) |
| 66–127 | `rand_b` | κρυπτογραφικά τυχαίο |

- Αναγνωριστικά από διαφορετικά milliseconds ταξινομούνται κατά χρόνο δημιουργίας όταν συγκρίνονται ως strings.
- Αναγνωριστικά εντός του ίδιου millisecond διαφέρουν στα τυχαία bits (δεν περιλαμβάνεται μονοτονικός μετρητής).
- Το timestamp προέρχεται από το ρολόι του συστήματος.

## Παραδείγματα

Επικύρωση εισερχόμενου id:

```typescript
import { isUuidV7, uuidv7 } from '@cqrs-ddd/uuidv7';

function requestId(header: string | undefined): string {
  return isUuidV7(header) ? header.trim().toLowerCase() : uuidv7();
}
```

Ανάγνωση του χρόνου δημιουργίας από τα πρώτα 48 bits:

```typescript
import { uuidv7 } from '@cqrs-ddd/uuidv7';

const id = uuidv7();
const createdAt = new Date(Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16));
```

## Άδεια χρήσης

Διπλή άδεια υπό **AGPLv3** και **Commercial License**. Δείτε τα αρχεία [`LICENSE`](https://github.com/aristoteliss/ddd-cqrs/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/ddd-cqrs/blob/master/COMMERCIAL_LICENSE.txt) στη ρίζα του repository.
