---
title: "@cqrs-ddd/pipeline-cache"
description: "Caching αποτελεσμάτων σε cache-manager και Keyv stores, με κλειδιά διαχωρισμένα ανά tenant, principal και scope δικαιωμάτων."
sidebar:
  order: 12
---

Αποθηκεύει συντεθειμένα αποτελέσματα queries σε backends [cache-manager](https://github.com/jaredwray/cacheable) και Keyv: μνήμη (in-memory), Redis, Memcache, SQLite, PostgreSQL, ή πολυεπίπεδους (multi-tier) συνδυασμούς.

Ένα cache hit επιστρέφει το αποθηκευμένο αποτέλεσμα άμεσα χωρίς να εκτελέσει τον handler ή τους εσωτερικούς ελέγχους οντοτήτων. Προς αποφυγή διαρροής δεδομένων μεταξύ χρηστών ή επιπέδων δικαιωμάτων, τα cache keys πρέπει να διαχωρίζονται ανά tenant, principal και permission scope.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/pipeline-cache @cqrs-ddd/pipeline cache-manager keyv
```

Προαιρετικοί adapters του Keyv για εξωτερική αποθήκευση:
- Redis: `@keyv/redis`
- PostgreSQL: `@keyv/postgres`
- SQLite: `@keyv/sqlite`
- Memcache: `@keyv/memcache`

## Δύο επίπεδα Cache στο `@cqrs-ddd`

Το `@cqrs-ddd` διαχωρίζει το caching σε δύο διακριτά, συμπληρωματικά επίπεδα:

1. **Pipeline Result Caching (`@cqrs-ddd/pipeline-cache`)**: Στο επίπεδο use case / query handler. Αποθηκεύει συντεθειμένα DTOs και view models. Ελέγχει τα όρια ασφαλείας (tenant, principal, permission scope) και τις πολιτικές ανανέωσης (freshness policies).
2. **Repository Snapshot Caching (`@FromCache`, `@Cache` στο `@cqrs-ddd/core`)**: Στο επίπεδο persistence. Αποθηκεύει σειριοποιημένα entity snapshots με συγκρίσεις εκδόσεων CAS (`isCacheNewer`) και mutation barriers.

Η ακύρωση (invalidation) μιας οντότητας στο persistence δεν ακυρώνει αυτόματα τα συντεθειμένα query responses. Κάθε επίπεδο διαχειρίζεται τον δικό του κύκλο ζωής.

## Χρήση

### 1. Plain Node.js / Μηχανή Pipeline

```typescript
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  buildCache,
  CacheBehavior,
  cache,
  createPartitionedCacheKeyFactory,
} from '@cqrs-ddd/pipeline-cache';

const cacheStore = buildCache({
  store: { type: 'redis', url: process.env.REDIS_URL, namespace: 'query_cache' },
  ttl: 60_000,
});

const pipeline = createPipeline({
  behaviors: [new CacheBehavior(cacheStore)],
});

const orderListKey = createPartitionedCacheKeyFactory({
  principal: (ctx) => ctx.items.get('userId') as string,
  scope: (ctx) => ctx.items.get('userRolesHash') as string,
  includeTenant: true,
});

export const getOrders = pipeline.wrap(
  { name: 'getOrders', kind: 'query' },
  cache({ key: orderListKey, ttl: 30_000 }),
)(async (filter: OrderFilterDto) => ordersService.listOrders(filter));
```

### 2. Ενσωμάτωση στο NestJS (`@cqrs-ddd/nestjs`)

Καταχωρίστε το `CacheBehavior` ως provider στο infrastructure module σας:

```typescript
import { Module } from '@nestjs/common';
import { buildCache, CacheBehavior } from '@cqrs-ddd/pipeline-cache';

@Module({
  providers: [
    {
      provide: CacheBehavior,
      useFactory: () => {
        return new CacheBehavior(
          buildCache({
            store: { type: 'redis', url: process.env.REDIS_URL },
            ttl: 60_000,
          }),
        );
      },
    },
  ],
  exports: [CacheBehavior],
})
export class CacheModule {}
```

Διακοσμήστε τον `@QueryHandler` με το `cache()`:

```typescript
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { cache } from '@cqrs-ddd/pipeline-cache';

@QueryHandler(GetCatalogQuery)
@UsePipeline(cache({ key: catalogKeyFactory, ttl: 120_000 }))
export class GetCatalogHandler implements IQueryHandler<GetCatalogQuery> {
  async execute(query: GetCatalogQuery) {
    return this.catalog.load(query);
  }
}
```

## Αποθηκευτικά Backends & Πολυεπίπεδο Caching (Multi-Tier)

Το `buildCache(options)` διαμορφώνει αποθήκευση μονού ή πολλαπλών επιπέδων:

```typescript
const multiTierCache = buildCache({
  store: [
    { type: 'memory', ttl: 10_000 },
    { type: 'redis', url: process.env.REDIS_URL, ttl: 300_000 },
  ],
  nonBlocking: true,
});
```

| Τύπος Store | Απαιτούμενο πακέτο | Βέλτιστη χρήση |
| --- | --- | --- |
| `'memory'` | Ενσωματωμένο | L1 in-process caching, testing, dev περιβάλλοντα |
| `'redis'` | `@keyv/redis` | Κατανεμημένο L2 caching, microservices υψηλής απόδοσης |
| `'postgres'` | `@keyv/postgres` | Σχεσιακές βάσεις χωρίς αποκλειστική υποδομή Redis |
| `'sqlite'` | `@keyv/sqlite` | Ενσωματωμένες εφαρμογές CLI/desktop ή edge |
| `'memcache'` | `@keyv/memcache` | Key-value stores υψηλού όγκου |

## Διαχωρισμός κλειδιών & Όρια ασφαλείας

Τα κλειδιά short-circuit αποτελούν κρίσιμο όριο ασφαλείας. Η επιστροφή αποθηκευμένου αποτελέσματος παρακάμπτει όλους τους εσωτερικούς ελέγχους δικαιωμάτων πεδίων και οντοτήτων.

Διαχωρίζετε πάντοτε τα κλειδιά ανά tenant, principal και scope δικαιωμάτων:

```typescript
import { createPartitionedCacheKeyFactory } from '@cqrs-ddd/pipeline-cache';
import { abilityDigest, getCaslPrincipal } from '@cqrs-ddd/pipeline-casl';

export const userProfileKey = createPartitionedCacheKeyFactory({
  principal: (ctx) => getCaslPrincipal(ctx)?.id,
  scope: abilityDigest,
  includeTenant: true,
  requireTenant: true,
  requirePrincipal: true,
  requireScope: true,
});
```

| Επιλογή Factory | Τύπος | Προεπιλογή | Περιγραφή |
| --- | --- | --- | --- |
| `principal` | `(ctx) => string \| undefined` | υποχρεωτικό | Ταυτοποιεί τον καλούντα. Ρίχνει `MissingCachePartitionError` αν απουσιάζει. |
| `scope` | `(ctx) => string \| undefined` | `undefined` | Αποτύπωμα δικαιωμάτων (ρόλοι ή `abilityDigest`). |
| `requirePrincipal` | `boolean` | `true` | Αν είναι `true`, ελλείπον principal ρίχνει σφάλμα fail-closed. |
| `requireScope` | `boolean` | `true` | Αν είναι `true`, ελλείπον scope δικαιωμάτων ρίχνει σφάλμα. |
| `includeTenant` | `boolean` | `true` | Προσαρτά το ενεργό tenant ID στο κλειδί. |
| `requireTenant` | `boolean` | τιμή του `includeTenant` | Επιβάλλει την παρουσία tenant στο context εκτέλεσης. |

## Επιλογές παραμετροποίησης

| Επιλογή | Τύπος | Προεπιλογή | Περιγραφή |
| --- | --- | --- | --- |
| `key` | `CacheKeyFactory` | υποχρεωτικό | Υπολογίζει το cache key από το context του pipeline. |
| `ttl` | `number` | Προεπιλογή cache | Χρόνος ζωής της εγγραφής σε milliseconds. |
| `kinds` | `DeclaredKind[]` | `['query']` | Είδη αιτημάτων στα οποία εφαρμόζεται (συνήθως μόνο queries). |
| `condition` | `(ctx) => boolean \| Promise<boolean>` | `undefined` | Συνθήκη που καθορίζει αν το συγκεκριμένο αίτημα θα ελέγξει/αποθηκεύσει στην cache. |
| `failOpen` | `boolean` | `true` | Όταν είναι `true`, σφάλματα του υποκείμενου store καταγράφουν προειδοποίηση και η εκτέλεση συνεχίζει χωρίς cache. Όταν είναι `false`, ρίχνεται σφάλμα. |

## Παρατηρησιμότητα (Observability)

Το `CacheBehavior` καταγράφει στοιχεία runtime στο `context.items`:
- `CACHE_HIT_ITEM_TOKEN`: Boolean που δηλώνει αν το αποτέλεσμα προήλθε από την cache.
- `CACHE_KEY_ITEM_TOKEN`: String του κλειδιού στο οποίο αναζητήθηκε ή γράφτηκε η εγγραφή.

Μετατρέψτε τα σε tracing attributes με το `buildCacheAttributes(context)`.

## Σειρά των behaviors

Τοποθετήστε το `CacheBehavior` **μετά** από validation και authorization:
1. `ZodValidationBehavior`: Επικυρώνει και κανονικοποιεί τις παραμέτρους.
2. `CaslBehavior`: Ελέγχει την εξουσιοδότηση τύπου.
3. `CacheBehavior`: Ελέγχει το cache key με το αυθεντικοποιημένο principal και scope δικαιωμάτων.

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-cache/)
