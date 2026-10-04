---
title: "@cqrs-ddd/pipeline-correlation"
description: "Correlation id propagation through HTTP requests, message consumers and jobs, and into pipelines."
sidebar:
  order: 31
---

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

## The HTTP middleware

| Option | Meaning | Default |
| --- | --- | --- |
| `header` | the header to read; an invalid field name throws when the middleware is built | `'x-correlation-id'` |
| `acceptIncoming` | accept an id sent by the client | `true` |
| `trimIncoming` | trim whitespace around an incoming id | `false` |
| `maxLength` | the longest incoming id accepted | `128` |
| `validateIncoming` | a predicate an incoming id must pass | the characters of `DEFAULT_CORRELATION_ID_PATTERN` |

An incoming id that fails these checks is replaced by a new one.

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
added; `runWithCorrelationId(id, fn)` runs `fn` with that id, or the current one when `id`
is empty.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-correlation/)
