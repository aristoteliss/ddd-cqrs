---
title: HTTP errors
description: Turn the errors of behaviors and of the domain into HTTP answers in any HTTP framework.
sidebar:
  order: 7
---

Behaviors throw plain errors; none of them knows about HTTP. A package whose errors have
an obvious HTTP meaning provides a separate `/http` entry point with one function,
`toHttpResponse(error)`, which returns `{ status, body, headers }`. Any framework can send
that answer.

| Entry point | Error | Status |
| --- | --- | --- |
| `@cqrs-ddd/pipeline-zod/http` | `ZodValidationError` | 400, with the validation details |
| `@cqrs-ddd/pipeline-casl/http` | `UnauthorizedActionException` | 403 |
| `@cqrs-ddd/pipeline-feature-flags/http` | `FeatureDisabledError` | 403, or 404 with `{ hideFeature: true }` |
| `@cqrs-ddd/pipeline-idempotency/http` | `IdempotencyConflictError` | 409 for an operation in progress, 422 for a key reused with another request |
| `@cqrs-ddd/pipeline-rate-limit/http` | `RateLimitExceededError` | 429, with a `Retry-After` header |
| `@cqrs-ddd/core/http` | domain exceptions, through `domainErrorHttpStatus(error)` | the status of the exception, such as 404 for `EntityNotFoundException` |

The main entry points never import the `/http` ones, so an application that does not
answer HTTP requests does not load them.

## In an Express error handler

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

A hidden feature answers 404 so that a client cannot tell a disabled feature from a
missing route:

```ts
import { toHttpResponse } from '@cqrs-ddd/pipeline-feature-flags/http';

const { status, body } = toHttpResponse(error, { hideFeature: true });
```

## Errors without an HTTP meaning

A missing tenant or principal in a partitioned key (`MissingPartitionError` and its
per-package subclasses), a broken pipeline configuration or a failed audit write are
faults of the application, not of the request. They have no `/http` mapping and should
answer 500.
