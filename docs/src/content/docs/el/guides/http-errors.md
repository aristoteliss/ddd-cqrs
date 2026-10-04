---
title: HTTP σφάλματα
description: "Μετατρέψτε τα σφάλματα των behaviors και του domain σε HTTP απαντήσεις σε οποιοδήποτε HTTP framework."
sidebar:
  order: 7
---

Τα behaviors ρίχνουν απλά σφάλματα (plain errors). Κανένα από αυτά δεν γνωρίζει περί HTTP. Ένα πακέτο
του οποίου τα σφάλματα έχουν προφανές HTTP νόημα παρέχει ένα ξεχωριστό entry point `/http` με μία
συνάρτηση, `toHttpResponse(error)`, η οποία επιστρέφει `{ status, body, headers }`. Οποιοδήποτε
framework μπορεί να αποστείλει αυτή την απάντηση.

| Entry point | Σφάλμα (Error) | Status |
| --- | --- | --- |
| `@cqrs-ddd/pipeline-zod/http` | `ZodValidationError` | 400, με τις λεπτομέρειες του validation |
| `@cqrs-ddd/pipeline-casl/http` | `UnauthorizedActionException` | 403 |
| `@cqrs-ddd/pipeline-feature-flags/http` | `FeatureDisabledError` | 403, ή 404 με `{ hideFeature: true }` |
| `@cqrs-ddd/pipeline-idempotency/http` | `IdempotencyConflictError` | 409 για λειτουργία σε εξέλιξη, 422 για κλειδί που επαναχρησιμοποιείται με άλλο αίτημα |
| `@cqrs-ddd/pipeline-rate-limit/http` | `RateLimitExceededError` | 429, με επικεφαλίδα `Retry-After` |
| `@cqrs-ddd/core/http` | domain exceptions, μέσω `domainErrorHttpStatus(error)` | το status του exception, όπως 404 για `EntityNotFoundException` |

Τα κύρια entry points δεν εισάγουν ποτέ τα `/http`, επομένως μια εφαρμογή που δεν εξυπηρετεί HTTP
αιτήματα δεν τα φορτώνει.

## Σε έναν Express error handler

```ts
import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { toHttpResponse as zodAnswer } from '@cqrs-ddd/pipeline-zod/http';
import { RateLimitExceededError } from '@cqrs-ddd/pipeline-rate-limit';
import { toHttpResponse as rateLimitAnswer } from '@cqrs-ddd/pipeline-rate-limit/http';

function answer(error: unknown) {
  if (error instanceof ZodValidationError) return zodAnswer(error);
  if (error instanceof RateLimitExceededError) return rateLimitAnswer(error);
  return undefined;
}

app.use((error, req, res, next) => {
  const mapped = answer(error);
  if (!mapped) return next(error);
  res.status(mapped.status).set(mapped.headers).json(mapped.body);
});
```

Ένα κρυφό feature απαντά με 404 ώστε ο client να μην μπορεί να διακρίνει ένα απενεργοποιημένο feature
από ένα ανύπαρκτο route:

```ts
import { toHttpResponse } from '@cqrs-ddd/pipeline-feature-flags/http';

const { status, body } = toHttpResponse(error, { hideFeature: true });
```

## Σφάλματα χωρίς HTTP νόημα

Ένα ελλείπον tenant ή principal σε ένα partitioned key (`MissingPartitionError` και οι υποκλάσεις του
ανά πακέτο), ένα εσφαλμένο configuration του pipeline ή μια αποτυχημένη εγγραφή audit αποτελούν
εσωτερικά σφάλματα της εφαρμογής και όχι του αιτήματος. Δεν διαθέτουν `/http` αντιστοίχιση και πρέπει
να επιστρέφουν status 500.
