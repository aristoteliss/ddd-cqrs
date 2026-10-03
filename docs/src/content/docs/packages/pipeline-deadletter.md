---
title: "@cqrs-ddd/pipeline-deadletter"
description: "Capture failed operations with their request, error, tenant and correlation id, and redrive them later."
sidebar:
  order: 18
---

Captures a failed operation as a dead letter: its request, error, tenant and correlation
id, sent to a transport (BullMQ, RabbitMQ or PostgreSQL). By default only events are
captured, since the caller of a command or a query already receives the error.
`DeadLetterRedriver` runs a captured request again later.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-deadletter @cqrs-ddd/pipeline
```

Each transport takes a client of its broker or database (`bullmq` queue, `amqplib`
confirm channel, `pg` pool), which the application installs.

## Usage

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  DeadLetterBehavior,
  deadLetter,
  PostgresDeadLetterTransport,
} from '@cqrs-ddd/pipeline-deadletter';

const transport = new PostgresDeadLetterTransport(pool);
const pipeline = createPipeline({ behaviors: [new DeadLetterBehavior(transport)] });

export const onUserCreated = pipeline.wrap(
  { name: 'onUserCreated', kind: 'event' },
  deadLetter({ rethrow: false, redactKeys: ['refreshToken'] }),
)(async (event: UserCreatedEvent) => mailer.sendWelcome(event.email));
```

The behavior's constructor takes the transport, optional defaults for every operation and
an optional logger.

## Transports

| Transport | Notes |
| --- | --- |
| `BullMqDeadLetterTransport` | adds each dead letter as a job of a BullMQ queue (job name `dead-letter` by default) |
| `RabbitMqDeadLetterTransport` | publishes to RabbitMQ through a confirm channel |
| `PostgresDeadLetterTransport` | inserts into a table, `dead_letters` by default; it is also a `DeadLetterStore`, which the redriver needs |

Another backend implements `DeadLetterTransport`: `send(record)`.

## Options

| Option | Meaning | Default |
| --- | --- | --- |
| `captureKinds` | request kinds that are captured | `['event']` |
| `rethrow` | rethrow the error after capturing it; `false` swallows it, on events only | `true` |
| `ignoreErrors` | error classes, or a predicate, that are rethrown without being captured, such as validation errors | none |
| `redactKeys` | field names masked in the captured payload | none |
| `redact` | a function that replaces the payload redaction | none |
| `metadata` | a function that returns extra fields for the record | none |
| `includeStack` | include the stack trace | `true` |

`ignoreErrors` and `redactKeys` given both as constructor defaults and per operation are
combined; the other options are merged shallowly.

## Ordering

Place the behavior **outside** retries, so it captures a failure only once the retries are
exhausted, and **inside** validation, so expected validation errors are not captured.

## Redriving

```ts
import { DeadLetterRedriver } from '@cqrs-ddd/pipeline-deadletter';

const redriver = new DeadLetterRedriver(transport, {
  requestTypes: [UserCreatedEvent],
  dispatch: {
    // Only the handler that failed, not every subscriber of the event.
    event: (event, record) => eventHandlers[record.handlerName](event),
  },
});

await redriver.redrive(recordId);
```

The redriver rebuilds the request from the record, matching `record.requestName` against
the class names in `requestTypes`, dispatches it, and marks the record resolved. When the
handling fails again, it counts the attempt and rethrows. A record whose payload was
redacted needs a `rebuild` function that restores the redacted values. During a redrive,
the behavior neither captures the failure again nor swallows it.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-deadletter/)
