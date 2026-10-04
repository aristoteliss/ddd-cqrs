---
title: Multi-tenancy
description: "Μεταφέρετε το tenant κάθε αιτήματος ή εργασίας μέσω pipelines, repositories και cache keys, και διακόψτε με ασφάλεια (fail closed) όταν απουσιάζει."
sidebar:
  order: 9
---

Το tenant ορίζεται μία φορά, εκεί όπου η εργασία εισέρχεται στην εφαρμογή, και διαβάζεται παντού αλλού
από το `AsyncLocalStorage`. Κάθε behavior και helper που οργανώνει δεδομένα με βάση το tenant αποτυγχάνει
με ασφάλεια (fails closed) όταν απαιτείται tenant αλλά δεν υπάρχει, διασφαλίζοντας ότι δύο tenants δεν
μοιράζονται ποτέ μια εγγραφή cache, μια εγγραφή idempotency ή ένα rate-limit bucket.

## Ορισμός του tenant

Η συνάρτηση `runWithTenant(tenantId, fn)` του `@cqrs-ddd/pipeline-tenant` ορίζει το tenant για
οτιδήποτε καλείται από τη `fn`, σύγχρονα ή ασύγχρονα. Το `currentTenantId()` το διαβάζει. Ένα HTTP
middleware ή ένας queue consumer το ορίζει στην είσοδο (edge), με βάση τα διαπιστευτήρια που
αυθεντικοποίησαν την εργασία:

```ts
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';

server.use((req, res, next) => runWithTenant(req.auth.tenantId, next));
```

Το tenant προέρχεται από επαληθευμένα διαπιστευτήρια (credentials) και ποτέ από header ή πεδίο
του σώματος που επιλέγει ελεύθερα ο client. Ο οδηγός
[HTTP με Express και Fastify](/ddd-cqrs/el/guides/http/) παρουσιάζει το middleware σε εφαρμογή,
και ο οδηγός [Background jobs](/ddd-cqrs/el/guides/background-jobs/) δείχνει πώς ένα job εκτελείται
στο tenant του αιτήματος που το έθεσε στην ουρά (enqueued).

## Pipelines

Ένα pipeline λαμβάνει το tenant κάθε εκτέλεσης από την πηγή `tenantId` του, μία φορά, κατά την έναρξη
της εκτέλεσης:

```ts
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

createCqrs({ sources: { tenantId: tenantSource } }); // ή createPipeline({ sources })
```

Το `context.tenantId` είναι αυτό το tenant, και οτιδήποτε καλείται από την αλυσίδα, συμπεριλαμβανομένων
ένθετων pipelines και του `currentTenantId()`, έχει πρόσβαση σε αυτό. Δείτε
[Το pipeline context](/ddd-cqrs/el/concepts/context/).

## Κλειδιά διαχωρισμένα ανά tenant (Partitioned keys)

Τα key factories των πακέτων cache, idempotency και rate-limit τοποθετούν το tenant πρώτο σε κάθε
κλειδί, και ρίχνουν σφάλμα όταν αυτό απουσιάζει:

| Factory | Κλειδί (Key) | Σφάλμα χωρίς tenant |
| --- | --- | --- |
| `createPartitionedCacheKeyFactory({ principal, scope })` | tenant, principal, permission scope, request | `MissingCachePartitionError` |
| `createPartitionedIdempotencyKeyFactory({ action, principal, operation })` | version, tenant, principal, action, operation | `MissingIdempotencyPartitionError` |
| `createPartitionedRateLimitKeyFactory(partition)` | tenant, caller, request | `MissingRateLimitPartitionError` |

```ts
import { cache, createPartitionedCacheKeyFactory } from '@cqrs-ddd/pipeline-cache';
import { abilityDigest } from '@cqrs-ddd/pipeline-casl';

const perCaller = createPartitionedCacheKeyFactory({
  principal: (ctx) => ctx.items.get('userId') as string | undefined,
  scope: (ctx) => abilityDigest(ctx),
});

@QueryHandler(GetOrdersQuery)
@UsePipeline(cache({ key: perCaller, ttl: 30_000 }))
class GetOrdersHandler {}
```

Η επιλογή `includeTenant: false` παραλείπει το tenant, για δεδομένα που είναι κοινά σε κάθε tenant,
όπως ένας δημόσιος τιμοκατάλογος. Ένα ελλείπον tenant αποτελεί εσωτερικό σφάλμα της εφαρμογής και όχι
του αιτήματος: επιστρέφει status 500, και οι
[αντιστοιχίσεις HTTP σφαλμάτων](/ddd-cqrs/el/guides/http-errors/) το αφήνουν χωρίς εξωτερική έκθεση.

## Repositories και Domain

Το `@cqrs-ddd/core` διαβάζει το tenant μέσω ενός resolver που καταχωρεί η εφαρμογή μία φορά,
κατά την εκκίνηση. Συνδέοντάς το με το tenant του pipeline, παρέχει στα repository cache keys
(`cacheKey`, `cacheKeyTemplate`) και στο `requireTenant()` το ίδιο tenant με τα behaviors:

```ts
import { setTenantResolver } from '@cqrs-ddd/core/application';
import { currentTenantId } from '@cqrs-ddd/pipeline-tenant';

setTenantResolver(currentTenantId);
```

Κώδικας που χρειάζεται το tenant για κρίσιμο σκοπό ασφαλείας καλεί το `requireTenant(purpose)`,
το οποίο το επιστρέφει ή ρίχνει `MissingTenantContextError` αναφέροντας τον συγκεκριμένο σκοπό.
Δεν επιστρέφει ποτέ κάποιο κοινόχρηστο default:

```ts
import { requireTenant } from '@cqrs-ddd/core/application';

const tenantId = requireTenant('access token issuance');
```

Η συνάρτηση `domainErrorHttpStatus()` του `@cqrs-ddd/core/http` απαντά στο `MissingTenantContextError`
με 500, αποκρύπτοντας το εσωτερικό του μήνυμα.

## Έλεγχος (Testing)

Ένα test εκτελεί εργασίες εντός tenant context χρησιμοποιώντας το `runWithTenant()`, όπως θα έκανε
ένα αίτημα, και μπορεί να επαληθεύσει ότι οι κλήσεις εκτός αυτού αποτυγχάνουν:

```ts
await runWithTenant('acme', () => queries.execute(new GetOrdersQuery()));
await expect(queries.execute(new GetOrdersQuery())).rejects.toThrow(MissingCachePartitionError);
```
