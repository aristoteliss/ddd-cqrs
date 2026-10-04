---
title: "@cqrs-ddd/pipeline-tenant"
description: "Το τρέχον tenant μιας εκτέλεσης, διατηρούμενο σε AsyncLocalStorage και παρεχόμενο στα pipelines ως context source."
sidebar:
  order: 30
---

Διατηρεί το τρέχον tenant μιας εκτέλεσης στο `AsyncLocalStorage`. Η συνάρτηση `runWithTenant(id, fn)` το ορίζει για οτιδήποτε καλείται από τη `fn`, σύγχρονα ή ασύγχρονα. Το `currentTenantId()` το διαβάζει, και το `tenantSource` το παραδίδει στο pipeline, ώστε κάθε pipeline να εκτελείται στο tenant της εργασίας που το ξεκίνησε. Το πακέτο δεν έχει εξωτερικές εξαρτήσεις.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/pipeline-tenant
```

## Χρήση

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import { currentTenantId, runWithTenant, tenantSource } from '@cqrs-ddd/pipeline-tenant';

const pipeline = createPipeline({ sources: { tenantId: tenantSource } });

const listOrders = pipeline.wrap({ name: 'listOrders', kind: 'query' })(async () =>
  orders.findByTenant(currentTenantId()),
);

await runWithTenant('acme', () => listOrders());
```

Ένα HTTP middleware ή queue consumer ορίζει το tenant στην είσοδο (edge):

```ts
app.use((req, res, next) => runWithTenant(req.auth.tenantId, next));
```

## Σημασιολογία (Semantics)

- Το `runWithTenant(tenantId, fn)` επιστρέφει ό,τι επιστρέφει η `fn`. Μια ένθετη κλήση αντικαθιστά το tenant μόνο για το δικό της callback. Με `undefined` εκτελεί τη `fn` χωρίς tenant.
- Το `currentTenantId()` επιστρέφει το tenant της πιο εσωτερικής κλήσης `runWithTenant` ή του εκτελούμενου pipeline, ή `undefined` εκτός αυτών.
- Μέσα σε ένα pipeline, το `context.tenantId` είναι το tenant που έλαβε η εκτέλεση από την πηγή κατά την έναρξή της.

Τα behaviors cache, idempotency και rate-limit οργανώνουν τα κλειδιά τους με βάση αυτό το tenant και αποτυγχάνουν με ασφάλεια (fail closed) όταν απαιτείται tenant αλλά δεν υπάρχει. Δείτε [Το pipeline context](/ddd-cqrs/el/concepts/context/).

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-tenant/)
