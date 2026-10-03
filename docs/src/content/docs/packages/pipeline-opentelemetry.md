---
title: "@cqrs-ddd/pipeline-opentelemetry"
description: "OpenTelemetry spans, metrics and decision attributes for every wrapped operation."
sidebar:
  order: 19
---

OpenTelemetry instrumentation for wrapped operations:

- `TraceBehavior` opens a span per execution;
- `MetricsBehavior` records durations, invocations and in-flight executions;
- `AttributesBehavior` puts on the span what other behaviors decided (a cache hit, an
  idempotent replay, a rate-limit decision, a flag evaluation), through the
  `build<Name>Attributes` factories of their packages.

The package depends only on `@opentelemetry/api`. The application configures the SDK; with
none registered, the API returns no-op tracers and meters and nothing is recorded.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-opentelemetry @cqrs-ddd/pipeline @opentelemetry/api
```

## Usage

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import { buildCacheAttributes } from '@cqrs-ddd/pipeline-cache';
import {
  AttributesBehavior,
  MetricsBehavior,
  TraceBehavior,
} from '@cqrs-ddd/pipeline-opentelemetry';

const pipeline = createPipeline({
  behaviors: [new MetricsBehavior(console)],
  globalBehaviors: {
    before: [
      [TraceBehavior, { tracerName: 'shop' }],
      [MetricsBehavior, { meterName: 'shop' }],
      [AttributesBehavior, { factories: [buildCacheAttributes] }],
    ],
  },
});
```

`TraceBehavior` and `AttributesBehavior` take no constructor arguments.
`MetricsBehavior` takes an optional logger, which reports instrumentation failures.
`trace(options)` and `metrics(options)` build their entries for a call site.

## Traces

| Option | Meaning | Default |
| --- | --- | --- |
| `tracerName` | the tracer's instrumentation scope name | `'nestjs-pipeline'` |
| `enabled` | open a span for this operation | `true` |
| `spanName` | a string, or a function of the context | `{requestKind}.{requestName}`, such as `query.getPrice` |
| `attributeFactory` | extra span attributes from the context | none |
| `recordException` | record a thrown error on the span | `true` |

## Metrics

| Instrument | Type |
| --- | --- |
| `pipeline.handler.duration` | histogram, in milliseconds |
| `pipeline.handler.invocations` | counter, once per completed call |
| `pipeline.handler.active` | in-flight executions |

| Option | Meaning | Default |
| --- | --- | --- |
| `meterName` | the meter's instrumentation scope name | `'nestjs-pipeline'` |
| `enabled` | record metrics for this operation | `true` |
| `attributeFactory` | extra labels from the context; keep them low-cardinality | none |
| `includeContextAttributes` | add the request-local attribute bag to the labels | `false` |

The default labels are the request kind, the request name, the handler name and the
outcome. Instrumentation is best-effort: a telemetry failure never replaces the operation's
result or its error.

## Attributes

The attribute names are in `PIPELINE_OTEL_ATTRIBUTES`: `pipeline.request.kind`,
`pipeline.request.name`, `pipeline.handler.name`, `pipeline.correlation_id`,
`pipeline.tenant_id`, `pipeline.outcome` and `error.type`. A custom behavior adds attributes
for the current execution with `addPipelineTelemetryAttributes()`.

## Ordering

Place `TraceBehavior` and `MetricsBehavior` first, so they cover every other behavior.
Place `AttributesBehavior` inside them and outside the behaviors it describes: it runs its
factories after the chain unwinds, when every inner behavior has published its decision.
It never changes the result or the error of the chain.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-opentelemetry/)
