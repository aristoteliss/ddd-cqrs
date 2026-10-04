---
title: HTTP με Express και Fastify
description: "Εξυπηρετήστε μια εφαρμογή βασισμένη στο @cqrs-ddd/cqrs από routes σε Express ή Fastify, με tenant και correlation id ανά αίτημα και αντιστοίχιση κάθε σφάλματος σε HTTP απάντηση."
sidebar:
  order: 8
---

Τα πακέτα δεν απαντούν απευθείας σε HTTP αιτήματα από μόνα τους: ένα route καλεί τα buses, και ένας error
handler μετατρέπει τα σφάλματα σε HTTP απαντήσεις. Αυτός ο οδηγός συνδέει τα buses του
[`createCqrs()`](/ddd-cqrs/el/packages/cqrs/) με το Express και το Fastify. Το `api/` του repository
είναι μια ολοκληρωμένη εφαρμογή δομημένη με αυτόν τον τρόπο.

## Εκκίνηση της εφαρμογής

Κατασκευάστε την εφαρμογή μία φορά, πριν ξεκινήσει να ακούει ο server, και πάρτε τα buses από αυτήν:

```ts
import { createCqrs } from '@cqrs-ddd/cqrs';

const cqrs = createCqrs({ sources: { tenantId: tenantSource, correlationId: correlationSource } });
cqrs.register(new CreateUserHandler(users, cqrs.eventBus), new GetUserHandler(users));
const { commandBus: commands, queryBus: queries } = cqrs;
```

## Το context ενός αιτήματος (Request context)

Τα behaviors διαβάζουν το tenant και το correlation id από το `AsyncLocalStorage`, μέσω των
`sources` που παρέχονται στο `createCqrs()`. Ένα middleware ρυθμίζει και τα δύο για οτιδήποτε
εκτελεί το αίτημα: το `httpCorrelation()` λαμβάνει το correlation id από την επικεφαλίδα
`x-correlation-id` ή δημιουργεί ένα νέο, και το `runWithTenant()` θέτει το tenant για το οποίο
αυθεντικοποιήθηκε το αίτημα.

```ts
import { httpCorrelation } from '@cqrs-ddd/pipeline-correlation';
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';
import type { IncomingMessage, ServerResponse } from 'node:http';

const correlation = httpCorrelation();

function requestContext(req: IncomingMessage, res: ServerResponse, next: () => void) {
  correlation(req, res, () => runWithTenant(tenantOf(req), next));
}
```

Η συνάρτηση `tenantOf(req)` διαβάζει το tenant από τον μηχανισμό που αυθεντικοποίησε το αίτημα,
όπως ένα επαληθευμένο token, και ποτέ από τιμή που μπορεί να ορίσει ελεύθερα ο client. Το principal
τοποθετείται στο δικό του store του `AsyncLocalStorage` της εφαρμογής με τον ίδιο τρόπο, από όπου
το διαβάζει η πηγή δικαιωμάτων CASL (permission source).

Καταχωρίστε το middleware μετά το parsing του body, ώστε το route να εκτελείται μέσα σε αυτό:

```ts
// Express
const server = express();
server.use(express.json());
server.use(requestContext);

// Fastify
const server = Fastify();
server.addHook('preHandler', (req, reply, done) => requestContext(req.raw, reply.raw, done));
```

## Routes

Ένα route αντιστοιχίζει το αίτημα σε ένα command ή query και το εκτελεί. Το `createZodMapper()` του
`@cqrs-ddd/pipeline-zod` κάνει parse το body σε command και ρίχνει `ZodValidationError` όταν είναι μη έγκυρο:

```ts
import { createZodMapper } from '@cqrs-ddd/pipeline-zod';

const CreateUserMapper = createZodMapper(
  CreateUserBody.transform((body) => new CreateUserCommand(body)),
);

// Express: Το Express 5 προωθεί έναν rejected handler στον error handler
server.post('/users', async (req, res) => {
  const user = await commands.execute(CreateUserMapper.map(req.body));
  res.status(201).json({ id: user.id });
});

// Fastify
server.post('/users', async (req, reply) => {
  const user = await commands.execute(CreateUserMapper.map(req.body));
  return reply.code(201).send({ id: user.id });
});
```

## Σφάλματα (Errors)

Κάθε πακέτο του οποίου τα σφάλματα έχουν νόημα σε HTTP τα αντιστοιχίζει στο entry point `/http` του,
και το `@cqrs-ddd/core/http` αντιστοιχίζει τα domain exceptions. Δείτε τα
[HTTP σφάλματα](/ddd-cqrs/el/guides/http-errors/) για τα αντίστοιχα status codes. Μία συνάρτηση
τα ελέγχει διαδοχικά:

```ts
import { domainErrorHttpStatus } from '@cqrs-ddd/core/http';
import { UnauthorizedActionException } from '@cqrs-ddd/pipeline-casl';
import { toHttpResponse as caslAnswer } from '@cqrs-ddd/pipeline-casl/http';
import { FeatureDisabledError } from '@cqrs-ddd/pipeline-feature-flags';
import { toHttpResponse as featureAnswer } from '@cqrs-ddd/pipeline-feature-flags/http';
import { IdempotencyConflictError } from '@cqrs-ddd/pipeline-idempotency';
import { toHttpResponse as idempotencyAnswer } from '@cqrs-ddd/pipeline-idempotency/http';
import { RateLimitExceededError } from '@cqrs-ddd/pipeline-rate-limit';
import { toHttpResponse as rateLimitAnswer } from '@cqrs-ddd/pipeline-rate-limit/http';
import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { toHttpResponse as zodAnswer } from '@cqrs-ddd/pipeline-zod/http';

type Answer = { status: number; body: object; headers: Record<string, string> };

function answer(error: unknown): Answer {
  if (error instanceof ZodValidationError) return zodAnswer(error);
  if (error instanceof UnauthorizedActionException) return caslAnswer(error);
  if (error instanceof FeatureDisabledError) return featureAnswer(error);
  if (error instanceof IdempotencyConflictError) return idempotencyAnswer(error);
  if (error instanceof RateLimitExceededError) return rateLimitAnswer(error);
  const domain = domainErrorHttpStatus(error);
  if (domain) return { status: domain.statusCode, body: domain, headers: {} };
  return { status: 500, body: { error: 'Internal Server Error' }, headers: {} };
}

// Express
server.use((error: unknown, _req, res, _next) => {
  const { status, body, headers } = answer(error);
  res.status(status).set(headers).json(body);
});

// Fastify
server.setErrorHandler((error, _req, reply) => {
  const { status, body, headers } = answer(error);
  reply.code(status).headers(headers).send(body);
});
```

Ένα σφάλμα που δεν αναγνωρίζεται από καμία αντιστοίχιση, όπως ένα missing tenant σε ένα partitioned key,
αποτελεί πρόβλημα της εφαρμογής και απαντά με 500 χωρίς να αποκαλύπτει το εσωτερικό του μήνυμα.

## Τερματισμός λειτουργίας (Shutting down)

Κλείστε πρώτα τον server ώστε να μην ξεκινήσει κανένα νέο αίτημα, στη συνέχεια τα buses, τα οποία
περιμένουν τους event handlers που βρίσκονται σε εξέλιξη, και τέλος τους πόρους που χρησιμοποιούνται,
όπως η βάση δεδομένων:

```ts
process.once('SIGTERM', async () => {
  await new Promise((resolve) => server.close(resolve)); // Fastify: await server.close()
  await cqrs.close();
  await orm.close();
});
```

## Στην εφαρμογή-παράδειγμα

Το `api/` του repository εφαρμόζει αυτά τα βήματα στους χρήστες, τους ρόλους και τα sessions
ενός multi-tenant API, και στα δύο frameworks από έναν ενιαίο πίνακα routes:

- κάθε route είναι data, με ένα Zod schema ανά input (`api/src/http/route.ts`), και ένας
  ενιαίος μηχανισμός `dispatch` κάνει parse το input και εκτελεί το route σε οποιοδήποτε από τα δύο frameworks,
- το `api/src/mount.ts` συνδέει το request context, τις HTTP απαντήσεις σφαλμάτων και το authentication.
  Το authentication εκτελείται γύρω από κάθε route, πριν γίνει parse το input του,
- το `api/src/app.ts` κατασκευάζει το store, τα behaviors, τα buses και κάθε handler με `new`,
- η εντολή `pnpm openapi` παράγει το OpenAPI έγγραφο του route table από τα ίδια schemas.

Το [README](https://github.com/aristoteliss/ddd-cqrs/tree/master/api) του περιγράφει τα endpoints,
το συμβόλαιο authentication και τα σχετικά tests.
