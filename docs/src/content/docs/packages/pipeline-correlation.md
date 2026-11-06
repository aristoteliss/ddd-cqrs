---
title: "@cqrs-ddd/pipeline-correlation"
description: "Correlation id propagation through HTTP requests, message consumers and jobs, and into pipelines."
sidebar:
  order: 31
---
[![npm version](https://img.shields.io/npm/v/@cqrs-ddd/pipeline-correlation.svg)](https://www.npmjs.com/package/@cqrs-ddd/pipeline-correlation)
[![npm downloads](https://img.shields.io/npm/dm/@cqrs-ddd/pipeline-correlation.svg)](https://www.npmjs.com/package/@cqrs-ddd/pipeline-correlation)
[![Node.js](https://img.shields.io/node/v/@cqrs-ddd/pipeline-correlation.svg)](https://www.npmjs.com/package/@cqrs-ddd/pipeline-correlation)
[![License](https://img.shields.io/badge/license-AGPL--3.0%20%7C%20commercial-blue.svg)](https://github.com/aristoteliss/ddd-cqrs#license-and-commercial-use)

Propagates a correlation id, the id that ties a piece of work to the request or message
that caused it, through a Node.js application:

- `httpCorrelation()` takes it from an incoming HTTP header, or creates one;
- `@WithCorrelation()` takes it from a queue job, a message or a notification, on the
  consumer method, in both TypeScript decorator modes;
- `correlationSource` hands it to pipelines, and `correlationHeaders()` and
  `addCorrelationId()` carry it into outgoing requests and messages.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-correlation
```

## Usage

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  correlationSource,
  getCorrelationId,
  httpCorrelation,
} from '@cqrs-ddd/pipeline-correlation';

const pipeline = createPipeline({ sources: { correlationId: correlationSource } });

app.use(httpCorrelation());
app.get('/ping', (_req, res) => res.send(getCorrelationId()));
```

The middleware `httpCorrelation()` returns, `(req, res, next)`, fits Node's `http` server,
Express and Connect.

### NestJS Integration (`@cqrs-ddd/nestjs`)

For NestJS applications, import `CorrelationMiddleware` from `@cqrs-ddd/nestjs/correlation` and register it in `AppModule`:

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { CorrelationMiddleware } from '@cqrs-ddd/nestjs/correlation';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
```

The middleware applies the rules `configureCorrelation()` sets; see
[Rules for incoming ids](#rules-for-incoming-ids).

## The HTTP middleware

| Option | Meaning | Default |
| --- | --- | --- |
| `header` | the header to read; an invalid field name throws when the middleware is built | `'x-correlation-id'` |
| `acceptIncoming` | accept an id sent by the client | `true` |
| `trimIncoming` | trim whitespace around an incoming id | `false` |
| `maxLength` | the longest incoming id accepted | the `maxLength` of `configureCorrelation()`, `128` by default |
| `validateIncoming` | a predicate an incoming id must pass | the `validateIncoming` of `configureCorrelation()`, the characters of `DEFAULT_CORRELATION_ID_PATTERN` by default |

An incoming id that fails these checks is replaced by a new one and reported to
`onRejected` with the source `'http'`.

## Rules for incoming ids

From 0.5.2, every entry point checks the id it receives: `httpCorrelation()`,
`runWithCorrelationId()`, `@WithCorrelation()`, and `correlationSource.accepts()`, which job
contexts use. An id passes when:

1. it is printable ASCII (0x20 to 0x7E) and neither starts nor ends with a space. Nothing
   turns this check off: any other id changes between services (HTTP and gRPC strip
   surrounding spaces, gRPC text metadata refuses non-ASCII characters) or carries
   control characters into logs and headers;
2. it is at most `maxLength` characters, 128 by default;
3. `validateIncoming` accepts it; by default it matches `DEFAULT_CORRELATION_ID_PATTERN`.

Until `configureCorrelation()` is called, `runWithCorrelationId()` and `@WithCorrelation()`
apply only the first check, and `httpCorrelation()` and `accepts()` apply all three with
their defaults, as before 0.5.2. Once it is called, even as `configureCorrelation({})`,
every entry point applies all three.

A rejected id is replaced by the current id or a new one, and the work goes on; a missing
or empty id is replaced the same way. Set the rules once, at startup:

```ts
import { configureCorrelation } from '@cqrs-ddd/pipeline-correlation';

configureCorrelation({
  validateIncoming: (id) => /^[0-9a-f-]{36}$/i.test(id),
  onRejected: ({ reason, source, length }) =>
    logger.warn({ reason, source, length }, 'correlation id replaced'),
});
```

| Field | Meaning | Default |
| --- | --- | --- |
| `maxLength` | the longest incoming id accepted; a positive safe integer, or the call throws | `128` |
| `validateIncoming` | the application's rule; returning `false` or throwing rejects the id | the characters of `DEFAULT_CORRELATION_ID_PATTERN` |
| `onRejected` | called with `{ reason, source, length }` for each replaced id | none |

`reason` is `'not-string'`, `'too-long'`, `'invalid-character'`, `'surrounding-space'` or
`'rule'`. `source` is `'http'`, `'runWithCorrelationId'`, or `'Class.method'` for a
`@WithCorrelation()` method. The report leaves out the id itself, so a forged value never
reaches a log through it. A missing or empty id is not reported, `correlationSource.accepts()`
reports nothing, and an error `onRejected` throws is ignored.

Each call replaces every rule, and `configureCorrelation()` without a policy restores the
state before the first call. `validateIncoming` must accept the UUIDv7 ids `correlationSource.create()` makes:
the jobs a request enqueues carry the request's id, and a job whose context holds an id that
`accepts()` refuses fails. The `maxLength` and `validateIncoming` options of
`httpCorrelation()` replace these rules for that middleware only. An application that
renders a correlation id in HTML still escapes it.

## Consumers

`@WithCorrelation()` runs the decorated method with the correlation id of the message it
receives:

```ts
import { WithCorrelation } from '@cqrs-ddd/pipeline-correlation';

class WelcomeWorker {
  @WithCorrelation() // reads job.data.correlationId
  async process(job: { data: { correlationId?: string; userId: string } }) {}

  @WithCorrelation({ path: 'correlationId' })
  async onNotification(notification: { correlationId?: string }) {}
}
```

| Option | Meaning | Default |
| --- | --- | --- |
| `path` | a dot path into the first argument | `'data.correlationId'` |
| `extract` | a function of the method's arguments that returns the id | none |
| `logLevel` | the level of the line logged when the method starts, or `'none'` | `'debug'` |

`CorrelationFrom.grpc(key)` is an `extract` preset for gRPC handlers: it reads a key of
the call metadata, the method's second argument. For a message whose id is in its headers or
properties, pass an `extract` function:

```ts
class Consumers {
  // RabbitMQ (amqplib)
  @WithCorrelation({ extract: (message) => message.properties.correlationId })
  async onUserCreated(message: ConsumeMessage) {}

  // Kafka (kafkajs)
  @WithCorrelation({
    extract: ({ message }) => message.headers?.['x-correlation-id']?.toString(),
  })
  async onOrderPlaced(payload: EachMessagePayload) {}
}
```

## Outgoing work

```ts
await fetch(url, { headers: { ...correlationHeaders() } });
await queue.add('welcome', addCorrelationId({ userId }));
await runWithCorrelationId(job.correlationId, () => processBatch(job));
```

`addCorrelationId(data)` returns a shallow copy of a plain object with `correlationId`
added; `runWithCorrelationId(id, fn)` runs `fn` with that id when the
[rules](#rules-for-incoming-ids) accept it, and otherwise with the current id or a new one.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-correlation/)
