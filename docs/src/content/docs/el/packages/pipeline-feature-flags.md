---
title: "@cqrs-ddd/pipeline-feature-flags"
description: "Έλεγχος εκτέλεσης λειτουργιών βάσει OpenFeature boolean flags, με sticky rollouts, παραλλαγές (variants) και ασφαλείς εναλλακτικές (fallbacks)."
sidebar:
  order: 16
---

Εκτελεί μια λειτουργία μόνο όταν το αντίστοιχο boolean flag είναι ενεργό, μέσω του [OpenFeature](https://openfeature.dev), επιτρέποντας οποιονδήποτε OpenFeature provider: Unleash, Flagsmith, LaunchDarkly, flagd ή τοπικό αρχείο. Ένα απενεργοποιημένο flag διακόπτει τη λειτουργία πριν εκτελεστεί, είτε ρίχνοντας σφάλμα είτε επιστρέφοντας μια εναλλακτική τιμή (fallback).

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/pipeline-feature-flags @cqrs-ddd/pipeline @openfeature/server-sdk
```

Προσθέστε το πακέτο provider της υπηρεσίας flags που χρησιμοποιείτε.

## Χρήση

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  createFeatureFlagClient,
  FeatureFlagBehavior,
  featureFlag,
} from '@cqrs-ddd/pipeline-feature-flags';

const client = await createFeatureFlagClient({ provider: new UnleashProvider(config) });
const pipeline = createPipeline({ behaviors: [new FeatureFlagBehavior(client)] });

export const checkout = pipeline.wrap(
  { name: 'checkout', kind: 'command' },
  featureFlag({ flag: 'new-checkout' }),
)(async (cart: Cart) => orders.place(cart));
```

Το `createFeatureFlagClient({ client, provider, domain, waitForReady })` επιστρέφει τον δοσμένο client ή καταχωρεί τον provider για το domain και επιλύει τον client του. Το `releaseFeatureFlagProvider(options)` αφαιρεί την καταχώριση κατά τον τερματισμό.

## Επιλογές

| Επιλογή | Σημασία | Προεπιλογή |
| --- | --- | --- |
| `flag` | το boolean flag που ελέγχει τη λειτουργία. Χωρίς αυτό, το behavior δεν κάνει τίποτα | κανένα |
| `defaultValue` | τιμή όταν το flag δεν μπορεί να επιλυθεί | `false` (κλειστό) |
| `fallback` | τιμή που επιστρέφεται όταν το flag είναι κλειστό, αντί να ριχτεί σφάλμα | κανένα (ρίχνει σφάλμα) |
| `targetingKeyFactory` | σταθερή ταυτότητα για ποσοστιαία rollouts (π.χ. user id) | του constructor |
| `context` | επιπλέον context αξιολόγησης για τη συγκεκριμένη λειτουργία | κανένα |
| `allowedVariants` | εκτέλεση μόνο όταν το flag επιλύεται σε μία από αυτές τις παραλλαγές | οποιαδήποτε |
| `errorPolicy` | το `'use-default'` μεταχειρίζεται provider σφάλματα ως `defaultValue`, το `'throw'` ρίχνει `FeatureFlagEvaluationError` | `'use-default'` |

Το correlation id δεν χρησιμοποιείται ποτέ ως targeting key, διότι αλλάζει σε κάθε αίτημα και θα μετακινούσε τους χρήστες μεταξύ ομάδων rollout.

```ts
featureFlag({
  flag: 'recommendations-v2',
  targetingKeyFactory: (ctx) => ctx.items.get('userId') as string | undefined,
  fallback: () => [],
});
```

Το `FEATURE_FLAG_DECISION_ITEM_TOKEN` καταγράφει την απόφαση αξιολόγησης για μεταγενέστερα behaviors. Το `buildFeatureFlagAttributes` τη μετατρέπει σε χαρακτηριστικά trace ή audit.

## HTTP σφάλματα

Ένα απενεργοποιημένο flag ρίχνει `FeatureDisabledError`. Το `toHttpResponse(error)` από το `@cqrs-ddd/pipeline-feature-flags/http` επιστρέφει HTTP 403, ή 404 με `{ hideFeature: true }` ώστε ο client να μην μπορεί να διακρίνει ένα απενεργοποιημένο feature από μια ανύπαρκτη διαδρομή. Δείτε [HTTP σφάλματα](/ddd-cqrs/el/guides/http-errors/).

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-feature-flags/)
