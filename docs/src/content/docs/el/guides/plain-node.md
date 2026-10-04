---
title: Απλό Node.js
description: Τυλίξτε async συναρτήσεις με επικύρωση, idempotency, caching και logging σε έργο χωρίς framework και χωρίς βήμα build.
sidebar:
  order: 1
---

Αυτός ο οδηγός δημιουργεί δύο συναρτήσεις παραγγελιών σε απλά αρχεία `.mjs`, που εκτελούνται απευθείας από το Node.js:
μία εντολή (command) που επικυρώνει την είσοδό της και εκτελείται μία φορά ανά αναγνωριστικό παραγγελίας, και ένα ερώτημα (query) που εξυπηρετείται από cache.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/pipeline @cqrs-ddd/pipeline-cache @cqrs-ddd/pipeline-idempotency \
  @cqrs-ddd/pipeline-zod cache-manager keyv zod
```

## Ένα ενιαίο pipeline

Τα behaviors που χρειάζονται ρυθμίσεις κατασκευάζονται με αυτές: το store του idempotency, το cache και ο logger μέσω του οποίου γράφει κάθε behavior. Μια καθολική καταχώριση `logging()` καταγράφει κάθε κλήση.

```javascript
import { createPipeline, LoggingBehavior, logging } from '@cqrs-ddd/pipeline';
import { buildCache, CacheBehavior } from '@cqrs-ddd/pipeline-cache';
import { IdempotencyBehavior, MemoryIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';

const store = new MemoryIdempotencyStore();

const pipeline = createPipeline({
  behaviors: [
    new LoggingBehavior(console),
    new IdempotencyBehavior(store, {}, console),
    new CacheBehavior(buildCache({}), {}, console),
  ],
  globalBehaviors: { before: [logging({ requestResponseLogLevel: 'none' })] },
});
```

## Μία εντολή (Command)

Το `validated(order)` επικυρώνει και μετατρέπει την είσοδο με το Zod και παραδίδει στη συνάρτηση το επικυρωμένο αντίγραφο· το `idempotent()` την εκτελεί μία φορά ανά id παραγγελίας και επαναφέρει (replays) το αποθηκευμένο αποτέλεσμα σε περίπτωση επανάληψης του ίδιου id.

```javascript
import { idempotent } from '@cqrs-ddd/pipeline-idempotency';
import { validated } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

const order = z.object({
  orderId: z.string().min(1),
  sku: z.enum(['apple', 'pear']),
  qty: z.coerce.number().int().positive(),
});

export const placeOrder = pipeline.wrap(
  { name: 'placeOrder', kind: 'command' },
  validated(order),
  idempotent({ keyFactory: (context) => context.request.orderId }),
)(async (input) => ({ orderId: input.orderId, total: prices.get(input.sku) * input.qty }));
```

## Ένα ερώτημα (Query)

Το `cache()` εξυπηρετεί την τιμή από τη μνήμη μετά την πρώτη ανάγνωση. Το key factory ορίζει ότι η τιμή είναι κοινή για όλους τους καλούντες, επομένως δεν απαιτείται tenant ή principal.

```javascript
import { cache, createPartitionedCacheKeyFactory } from '@cqrs-ddd/pipeline-cache';

const publicPrice = createPartitionedCacheKeyFactory({
  includeTenant: false,
  principal: () => 'public',
  requireScope: false,
});

export const getPrice = pipeline.wrap(
  { name: 'getPrice', kind: 'query' },
  cache({ key: publicPrice, ttl: 60_000 }),
)(async (sku) => ({ sku, price: prices.get(sku) }));
```

## Κλήση των συναρτήσεων

Οι τυλιγμένες συναρτήσεις είναι κανονικές ασύγχρονες συναρτήσεις (`async`). Ένα επαναλαμβανόμενο order id επιστρέφει το πρώτο αποτέλεσμα χωρίς να επανεκτελείται η συνάρτηση· μια δεύτερη ανάγνωση τιμής επιστρέφεται από το cache. Ένα σφάλμα επικύρωσης αντιστοιχίζεται σε απάντηση HTTP 400 με το `toHttpResponse()` από το `@cqrs-ddd/pipeline-zod/http`· δείτε [Σφάλματα HTTP](/ddd-cqrs/el/guides/http-errors/).

```javascript
import { toHttpResponse } from '@cqrs-ddd/pipeline-zod/http';

await placeOrder({ orderId: 'o-1', sku: 'apple', qty: '2' }); // { orderId: 'o-1', total: 240 }
await placeOrder({ orderId: 'o-1', sku: 'apple', qty: '2' }); // επανάληψη αποθηκευμένου αποτελέσματος (replayed)

try {
  await placeOrder({ orderId: 'o-2', sku: 'plum', qty: 0 });
} catch (error) {
  toHttpResponse(error).status; // 400
}

store.destroy();
```

Το `store.destroy()` σταματά τον περιοδικό καθαρισμό των ληγμένων εγγραφών στη μνήμη.
