---
title: "@cqrs-ddd/pipeline-audit"
description: "Audit records of who did what, in which tenant and correlation, with which outcome, and with payloads redacted."
sidebar:
  order: 17
---

Writes an audit record for each audited operation: who did what, in which tenant and
correlation, with which outcome and how long it took, with the request (and optionally the
response) redacted. The behavior depends only on the `AuditSink` interface; `LogAuditSink`
writes to a logger and `PostgresAuditSink` to a table.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-audit @cqrs-ddd/pipeline
```

`PostgresAuditSink` takes a `pg` pool or client, which the application installs.

## Usage

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import { AuditBehavior, audit, LogAuditSink } from '@cqrs-ddd/pipeline-audit';

const pipeline = createPipeline({
  behaviors: [new AuditBehavior(new LogAuditSink())],
  globalBehaviors: { scope: 'commands', before: [AuditBehavior] },
});

export const deleteUser = pipeline.wrap(
  { name: 'deleteUser', kind: 'command' },
  audit({
    action: 'user.delete',
    severity: 'high',
    actor: (ctx) => ({ id: ctx.items.get('currentUserId') as string }),
  }),
)(async (id: string) => users.remove(id));
```

The behavior's constructor takes the sink, optional defaults for every operation and an
optional logger.

## The record

An `AuditRecord` holds an `id`, the `correlationId` and `tenantId`, the `action`, the
`severity`, the `outcome` (`'success'`, `'failure'` or `'pending'`), the `actor`, the
request kind and names, the redacted `payload` and `response`, the `error` on failure, the
`durationMs`, a `timestamp` and optional `metadata`.

A sink that implements `begin(record)` receives a `'pending'` record before the operation
runs, and `write(record)` replaces it with the final one under the same id, so an attempt
interrupted by a process stop stays visible.

## Sinks

| Sink | Notes |
| --- | --- |
| `LogAuditSink` | writes each record to a logger, `console` by default; `{ pretty: true }` formats it |
| `PostgresAuditSink` | inserts into a table, `audit_log` by default; create it once with `createAuditTableSql()` |

Another backend implements `AuditSink`: `write(record)`, and optionally `begin(record)`.

## Options

| Option | Meaning | Default |
| --- | --- | --- |
| `action` | the action recorded | `context.requestName` |
| `severity` | `'low'`, `'medium'`, `'high'` or `'critical'` | `'medium'`, or `'low'` for queries |
| `actor` | a function that returns the acting principal | none |
| `captureKinds` | request kinds that are audited | `['command']` |
| `captureRequest` | record the redacted request | `true` |
| `captureResponse` | record the redacted response | `false` |
| `redactKeys` | field names masked as `[REDACTED]`, added to the built-in ones (`password`, `token`, `secret`, …) | built-in only |
| `redact` | a function that replaces the built-in redaction | none |
| `metadata` | a function that returns extra fields for the record | none |
| `recordStart` | write the `'pending'` record to a sink that implements `begin` | `true` |
| `includeStack` | include the stack trace in failure records | `true` |
| `failOpen` | when building or writing the record fails, let a successful operation succeed | `true` |

An error of the operation is always rethrown unchanged. With `failOpen: false`, a failed
audit write fails an otherwise successful operation.

## Ordering

Place the audit behavior near the outside of the chain, such as `globalBehaviors.before`, so its
duration covers the whole operation, and after the behavior that identifies the caller, so
the `actor` function finds it. Behaviors inside it can add their decisions to the record
through `metadata`, such as `buildCacheAttributes` or `buildRateLimitAttributes`.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-audit/)
