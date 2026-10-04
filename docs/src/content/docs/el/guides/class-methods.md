---
title: Μέθοδοι κλάσεων
description: Διακοσμήστε μεθόδους με το pipeline.wrap() χρησιμοποιώντας τους standard decorators του TypeScript, με cache διαχωρισμένο ανά tenant.
sidebar:
  order: 2
---

Αυτός ο οδηγός διακοσμεί τις μεθόδους μιας κλάσης με το `@pipeline.wrap()` ως standard decorators:
ένα query με cache του οποίου το κλειδί περιέχει το tenant, και ένα command του οποίου την είσοδο επικυρώνει το Zod. Ο [οδηγός DDD](/ddd-cqrs/el/guides/ddd/) χρησιμοποιεί τον ίδιο wrapper με `experimentalDecorators`· μία ενιαία υλοποίηση εξυπηρετεί και τις δύο λειτουργίες.

## Μεταγλώττιση decorators

Το Node.js εκτελεί TypeScript αφαιρώντας τους τύπους, αλλά δεν μπορεί να αφαιρέσει τη σύνταξη decorators, επομένως ο κώδικας μεταγλωττίζεται με το `tsc`. Η ρύθμιση `experimentalDecorators: false` επιλέγει standard decorators:

```json
{
  "compilerOptions": {
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false
  }
}
```

## Το pipeline

Οι εκτελέσεις λαμβάνουν το tenant από το `@cqrs-ddd/pipeline-tenant`, επομένως το `runWithTenant()` θέτει το scope για κάθε κλήση μέσα σε αυτό.

```typescript
import { createPipeline } from '@cqrs-ddd/pipeline';
import { buildCache, CacheBehavior } from '@cqrs-ddd/pipeline-cache';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

export const pipeline = createPipeline({
  behaviors: [new CacheBehavior(buildCache({}))],
  sources: { tenantId: tenantSource },
});
```

## Query με cache και command με επικύρωση

Το κλειδί cache της `price()` διαχωρίζεται ανά tenant, ώστε δύο tenants να μην μοιράζονται ποτέ εγγραφή, και μια κλήση χωρίς tenant αποτυγχάνει αντί να διαβάσει κοινή εγγραφή. Η `reprice()` λαμβάνει την είσοδό της επικυρωμένη από το Zod. Οι μέθοδοι ονομάζονται `Catalog.price` και `Catalog.reprice`, από την κλάση και τη μέθοδο· η ρύθμιση `kind` δηλώνει τι κάνει η καθεμία.

```typescript
import { cache, createPartitionedCacheKeyFactory } from '@cqrs-ddd/pipeline-cache';
import { currentTenantId } from '@cqrs-ddd/pipeline-tenant';
import { validated } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

const perTenant = createPartitionedCacheKeyFactory({
  principal: () => 'public',
  requireScope: false,
});

const Reprice = z.object({
  sku: z.string().min(1),
  price: z.coerce.number().int().positive(),
});

export class Catalog {
  readonly #prices = new Map<string, number>();

  @pipeline.wrap({ kind: 'query' }, cache({ key: perTenant, ttl: 60_000 }))
  async price(sku: string): Promise<number | undefined> {
    return this.#prices.get(`${currentTenantId()}/${sku}`);
  }

  @pipeline.wrap({ kind: 'command' }, validated(Reprice))
  async reprice(input: z.input<typeof Reprice>): Promise<void> {
    const { sku, price } = input as z.output<typeof Reprice>;
    this.#prices.set(`${currentTenantId()}/${sku}`, price);
  }
}
```

## Δύο tenants

Το `runWithTenant()` ορίζει το tenant για οτιδήποτε καλείται εντός του:

```typescript
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';

const catalog = new Catalog();
await runWithTenant('acme', () => catalog.reprice({ sku: 'apple', price: '120' }));
await runWithTenant('globex', () => catalog.reprice({ sku: 'apple', price: 95 }));

await runWithTenant('acme', () => catalog.price('apple')); // 120
await runWithTenant('globex', () => catalog.price('apple')); // 95
await catalog.price('apple'); // απορρίπτει με MissingCachePartitionError
```

## Στο αποθετήριο

Ο φάκελος [`integration/payments/`](https://github.com/aristoteliss/ddd-cqrs/tree/master/integration/payments) περιέχει μια υπηρεσία πληρωμών δομημένη με αυτόν τον τρόπο, χρησιμοποιώντας μόνο το pipeline: χωρίς buses και χωρίς aggregates. Ένα pipeline περιέχει κάθε instance behavior, και κάθε μέθοδος δηλώνει τα δικά της, από έξω προς τα μέσα:

```typescript
@pipeline.wrap(
  { kind: 'command' },
  requires({ action: 'create', subject: 'Payment' }),
  rateLimit({ keyFactory: perMerchant }),
  audit({ action: 'payment.charge', actor }),
  validated(Charge),
  resilience({
    handle: (error) => error instanceof GatewayTimeoutError,
    retry: { maxAttempts: 2, replaySafe: true, backoff: { type: 'constant', delay: 0 } },
  }),
)
async charge(input: z.input<typeof Charge>): Promise<Payment> { /* ... */ }
```

Ένας μη εξουσιοδοτημένος έμπορος απορρίπτεται πριν καταγραφεί οτιδήποτε στο audit, ένα μη έγκυρο ποσό πριν κληθεί το gateway, και ένα gateway timeout επαναλαμβάνεται εντός μιας ενιαίας προσπάθειας audit.
