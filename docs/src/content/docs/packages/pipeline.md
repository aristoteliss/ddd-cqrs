---
title: "@cqrs-ddd/pipeline"
description: "The pipeline engine: createPipeline(), pipeline.wrap(), the logging behavior, pipeline items and context sources."
sidebar:
  order: 1
---

The engine of the pipeline family. `createPipeline()` configures behaviors once;
`pipeline.wrap()` runs them around a plain function or a class method. It needs no
framework, no dependency-injection container and no CQRS infrastructure. It also provides
`LoggingBehavior`, the contracts behaviors declare, typed pipeline items and the context
sources for the tenant and the correlation id.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline
```

Requires Node.js 22.12 or later, or another runtime with `AsyncLocalStorage` (Bun, Deno).

## Usage

```ts
import { createPipeline, LoggingBehavior, logging } from '@cqrs-ddd/pipeline';

export const pipeline = createPipeline({
  behaviors: [new LoggingBehavior(console)],
  globalBehaviors: { before: [logging({ requestResponseLogLevel: 'log' })] },
});

export const getPrice = pipeline.wrap({ name: 'getPrice', kind: 'query' })(
  async (sku: string) => prices.find(sku),
);

class Prices {
  @pipeline.wrap({ kind: 'query' })
  async find(sku: string) {}
}
```

## createPipeline options

| Option | Meaning | Default |
| --- | --- | --- |
| `behaviors` | behavior instances, one per class; a placed behavior without an instance is constructed with no arguments | none |
| `globalBehaviors` | behaviors around every operation: `{ scope, before, after }` or an array of them | none |
| `sources` | where executions take their tenant and correlation id from | none |
| `diagnostics` | what a contract violation does: `'strict'` throws, `'warn'` logs, `'off'` ignores | `'strict'` |
| `logger` | receives the `'warn'` diagnostics | `console` |

Global behaviors are constructed when the pipeline is created, so a missing dependency
fails there. Two instances of one behavior class are rejected.

## pipeline.wrap

`pipeline.wrap(options, ...entries)` or `pipeline.wrap(...entries)` returns a wrapper for a
function or a method, in the standard and the `experimentalDecorators` mode. The options
are `name`, `kind` (`'command'`, `'query'` or `'event'`) and `skip` (global behaviors to
leave out). See [How an operation is wrapped](/ddd-cqrs/concepts/wrapping/) for how the
name, the kind and the request are derived, and
[Execution order](/ddd-cqrs/concepts/execution-order/) for the order of behaviors.

`REQUEST_KIND` is the symbol by which a request declares its own kind; `@cqrs-ddd/core`
requests carry it.

## Logging

`LoggingBehavior` logs a line per execution with the correlation id, kind, names and
duration, and optionally the request and the response. `logging(options)` builds its entry.
It writes through the logger given to its constructor, or `console`.

| Option | Meaning | Default |
| --- | --- | --- |
| `metricLogLevel` | level of the line written after success | `'log'` |
| `errorLogLevel` | level of the line written when the call throws | `'error'` |
| `mapLogLevel` | a level per error class, the most specific class winning | none |
| `requestResponseLogLevel` | level of the request and response lines | `'debug'` |
| `excludeRequestObj`, `excludeResponseObj` | leave the payloads out of those lines | `true` |
| `excludeKeys` | keys or dot paths removed from logged payloads | `[]` |
| `redactKeys` | keys or dot paths masked as `[REDACTED]` | `[]` |
| `redactSensitiveKeys` | also mask well-known secrets such as passwords and tokens | `true` |
| `logFormat` | `'text'` lines or `'structured'` objects | `'text'` |

Each level is a `LogLevel` (`'log'`, `'error'`, `'warn'`, `'debug'`, `'verbose'`,
`'fatal'`) or `'none'`.

## Items and the request

- `createPipelineItem`, `getPipelineItem`, `setPipelineItem`, `requirePipelineItem` and
  `hasPipelineItem` share typed values between behaviors through `context.items`;
  `requirePipelineItem` throws `MissingPipelineItemError` for an absent value.
- `replaceRequest(context, value)` hands the function a new input, such as a parsed copy.

See [The pipeline context](/ddd-cqrs/concepts/context/).

## Contracts and identity

A behavior class can declare a contract under `PIPELINE_BEHAVIOR_CONTRACT` (ordering rules
and option checks) and a stable identity under `PIPELINE_BEHAVIOR_ID`. A violated contract
throws `PipelineConfigurationError` in `'strict'` mode. See
[Custom behaviors](/ddd-cqrs/guides/custom-behaviors/).

## Partitioned keys

`tenantSegments()` builds the tenant part of a key, and `MissingPartitionError` is the base
class of the errors that keyed behaviors throw when a required tenant or principal is
missing. The cache, idempotency and rate-limit packages build on them.

## Lower-level API

`compilePipelinePlan()`, `createPipelineRunner()`, `validateBehaviorContracts()` and
`pipelineStore` are the pieces `createPipeline()` is built from. A framework adapter uses them to run the same
behaviors around its own handlers.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline/)
