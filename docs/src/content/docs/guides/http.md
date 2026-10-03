---
title: HTTP with Express and Fastify
description: Serve an application on @cqrs-ddd/cqrs from Express or Fastify routes, with the tenant and correlation id of each request and every error mapped to an HTTP answer.
sidebar:
  order: 8
---

The packages answer no HTTP requests themselves: a route calls the buses, and an error
handler turns errors into answers. This guide wires the buses of
[`createCqrs()`](/ddd-cqrs/packages/cqrs/) into Express and into Fastify. The repository's
`api/` is a complete application built this way.

## Starting the application

Build the application once, before the server listens, and take the buses from it:

```ts
import { createCqrs } from '@cqrs-ddd/cqrs';

const cqrs = createCqrs({ sources: { tenantId: tenantSource, correlationId: correlationSource } });
cqrs.register(new CreateUserHandler(users, cqrs.eventBus), new GetUserHandler(users));
const { commandBus: commands, queryBus: queries } = cqrs;
```

## The context of a request

Behaviors read the tenant and the correlation id from `AsyncLocalStorage`, through the
`sources` given to `createCqrs()`. One middleware sets both for everything the
request runs: `HttpCorrelationMiddleware` takes the correlation id from the
`x-correlation-id` header or creates one, and `runWithTenant()` sets the tenant the
request authenticated for.

```ts
import { HttpCorrelationMiddleware } from '@cqrs-ddd/pipeline-correlation';
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';
import type { IncomingMessage, ServerResponse } from 'node:http';

const correlation = new HttpCorrelationMiddleware();

function requestContext(req: IncomingMessage, res: ServerResponse, next: () => void) {
  correlation.use(req, res, () => runWithTenant(tenantOf(req), next));
}
```

`tenantOf(req)` reads the tenant from what authenticated the request, such as a verified
token, never from a value the client can choose freely. The principal goes into the
application's own `AsyncLocalStorage` store the same way, where its CASL permission
source reads it.

Register the middleware after body parsing, so the route runs inside it:

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

A route maps the request to a command or query and executes it. `createZodMapper()` of
`@cqrs-ddd/pipeline-zod` parses the body into a command and throws `ZodValidationError`
when it is invalid:

```ts
import { createZodMapper } from '@cqrs-ddd/pipeline-zod';

const CreateUserMapper = createZodMapper(
  CreateUserBody.transform((body) => new CreateUserCommand(body)),
);

// Express: Express 5 forwards a rejected handler to the error handler
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

## Errors

Each package whose errors have an HTTP meaning maps them in its `/http` entry point, and
`@cqrs-ddd/core/http` maps the domain exceptions; see [HTTP errors](/ddd-cqrs/guides/http-errors/)
for the statuses. One function tries them in turn:

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

An error no mapping knows, such as a missing tenant in a partitioned key, is a fault of
the application and answers 500 without its message.

## Shutting down

Close the server first, so no request starts, then the buses, which wait for the event
handlers still running, then what they use, such as the database:

```ts
process.once('SIGTERM', async () => {
  await new Promise((resolve) => server.close(resolve)); // Fastify: await server.close()
  await cqrs.close();
  await orm.close();
});
```

## In the example application

The repository's `api/` applies these steps to the users, roles and sessions of a
multi-tenant API, on both frameworks from one route table:

- each route is data, with a Zod schema per input (`api/src/http/route.ts`), and one
  `dispatch` parses the input and runs the route on either framework;
- `api/src/mount.ts` puts the request context, the error answers and the authentication
  together; the authentication runs around every route, before its input is parsed;
- `api/src/app.ts` builds the store, the behaviors, the buses and every handler with
  `new`;
- `pnpm openapi` writes the OpenAPI document of the route table from the same schemas.

Its [README](https://github.com/aristoteliss/ddd-cqrs/tree/master/api) describes the
endpoints, the authentication contract and the tests.
