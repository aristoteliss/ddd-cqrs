---
title: "@cqrs-ddd/untyped"
description: "Μια typed αντικατάσταση για το `as any`: διαβάζει μη δηλωμένες ιδιότητες ως unknown. Χωρίς εξαρτήσεις και χωρίς framework."
editUrl: false
sidebar:
  order: 51
---

Μια typed αντικατάσταση για το `as any` όταν ο κώδικας πρέπει να διαβάσει μια ιδιότητα που δεν δηλώνεται στον τύπο, όπως metadata ενός framework σε ένα wrapper object. Το `untyped(value)` επιστρέφει την ίδια τιμή με τύπο `T & Record<string | symbol, unknown>`: οι δηλωμένες ιδιότητες διατηρούν τους τύπους τους, ενώ κάθε άλλη ιδιότητα διαβάζεται ως `unknown`, υποχρεώνοντας τον καλούντα να κάνει type narrowing. Ικανοποιεί τον κανόνα `noExplicitAny` του Biome χωρίς να απαιτείται καταστολή του κανόνα (lint suppression).

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/untyped
```

Απαιτεί Node.js 22.12 ή νεότερο. Χωρίς εξαρτήσεις, χωρίς framework.

## API

```typescript
import { untyped } from '@cqrs-ddd/untyped';

const scope = untyped(wrapper).scope; // unknown: κάντε narrowing πριν τη χρήση
if (typeof scope === 'number') {
  // ...
}
```

| Export | Signature | Περιγραφή |
| --- | --- | --- |
| `untyped` | `<T>(value: T) => T & Record<string \| symbol, unknown>` | Η ίδια τιμή, με τις μη δηλωμένες ιδιότητες να έχουν τύπο `unknown` |

Αλλάζει αποκλειστικά τον τύπο στο TypeScript. Η τιμή επιστρέφεται αυτούσια στο runtime.

## Παραδείγματα

Ανάγνωση ιδιότητας με symbol-key:

```typescript
import { untyped } from '@cqrs-ddd/untyped';

const TRACE = Symbol.for('app.trace');

function traceOf(request: object): string | undefined {
  const trace = untyped(request)[TRACE];
  return typeof trace === 'string' ? trace : undefined;
}
```

Οι δηλωμένες ιδιότητες διατηρούν τους τύπους τους:

```typescript
import { untyped } from '@cqrs-ddd/untyped';

interface Command {
  readonly id: string;
}

function describe(command: Command): string {
  const view = untyped(command);
  const source = view.source; // unknown
  return typeof source === 'string' ? `${view.id} from ${source}` : view.id; // το view.id παραμένει string
}
```

## Άδεια χρήσης

Διπλή άδεια υπό **AGPLv3** και **Commercial License**. Δείτε τα αρχεία [`LICENSE`](https://github.com/aristoteliss/ddd-cqrs/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/ddd-cqrs/blob/master/COMMERCIAL_LICENSE.txt) στη ρίζα του repository.
