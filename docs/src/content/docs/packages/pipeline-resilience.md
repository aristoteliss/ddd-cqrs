---
title: "@cqrs-ddd/pipeline-resilience"
description: "Retry, timeout and bulkhead around an operation, and named policies for outbound dependencies, built on cockatiel."
sidebar:
  order: 15
---

Resilience policies built on [cockatiel](https://github.com/connor4312/cockatiel), at two
places:

- `ResilienceBehavior` wraps a whole operation in the layers that make sense around it:
  **retry**, **timeout** and **bulkhead**.
- `ResiliencePolicies` holds **named policies** for outbound dependencies (a payment API,
  an SMTP server), with retry, circuit breaker, timeout, bulkhead and fallback. A circuit
  breaker and a fallback belong there, around the remote call, not around an operation.

A retry repeats everything inside the behavior, the operation included, so the package
makes the dangerous choices explicit: a misconfiguration fails when the function is
wrapped, not in production.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-resilience @cqrs-ddd/pipeline cockatiel
```

## Usage

`ResilienceBehavior` takes optional defaults and an optional logger, so the pipeline can
construct it.

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import { resilience } from '@cqrs-ddd/pipeline-resilience';

const pipeline = createPipeline();

export const lookup = pipeline.wrap(
  { name: 'lookup', kind: 'query' },
  resilience({
    retry: { maxAttempts: 3, backoff: { type: 'exponential' } },
    timeout: { duration: 2_000 },
    handle: (error) => error instanceof CatalogUnavailableError,
  }),
)(async (id: string) => catalog.find(id));
```

## Safety rules

- A retry needs `handle(error)`, which selects the errors worth retrying, unless
  `handleAllErrors: true` is chosen deliberately.
- A retry of a command or an event needs `retry.replaySafe: true`: the operation must be
  safe to run again.
- An `aggressive` timeout on a command or an event needs `timeout.replaySafe: true`: the
  caller is answered while the operation keeps running. A `cooperative` timeout signals
  cancellation and waits; the operation reads the signal with `getResilienceAbortSignal()`.
- A circuit breaker or a fallback on an operation is rejected; declare them on a named
  policy.

The behavior's contract checks these rules, so a violation throws
`PipelineConfigurationError` when the operation is wrapped (with the default `'strict'`
diagnostics). With diagnostics turned off, the behavior still refuses the first call with
`ResilienceConfigurationError`.

## Options

| Option | Meaning | Default |
| --- | --- | --- |
| `retry` | `{ maxAttempts, backoff, replaySafe }` | none |
| `timeout` | `{ duration, strategy: 'aggressive' \| 'cooperative', replaySafe }` | none; strategy `'aggressive'` |
| `bulkhead` | `{ limit, queue }`: at most `limit` concurrent executions, shared by every call of the operation | none |
| `handle` | which errors count as failures to retry | none |
| `handleAllErrors` | treat every error as retryable | `false` |
| `order` | composition order of the layers, outermost first | `['retry', 'bulkhead', 'timeout']` |
| `telemetry` | hooks fired by the underlying cockatiel policies, such as on each retry | none |
| `policy` | a prebuilt cockatiel policy, used as it is and not validated | none |

Constructor defaults are shallowly merged under the options of each operation. Policies are
built at the first call of each operation and reused.

## Named policies

```ts
import { ResiliencePolicies } from '@cqrs-ddd/pipeline-resilience';

const policies = new ResiliencePolicies({
  paymentsApi: {
    handle: (error) => error instanceof GatewayUnavailableError,
    retry: { maxAttempts: 2 },
    circuitBreaker: { halfOpenAfter: 10_000, breaker: { type: 'consecutive', threshold: 5 } },
    timeout: { duration: 3_000 },
  },
});

await policies.execute('paymentsApi', ({ signal }) => http.post('/charges', order, { signal }));
```

Every policy is built when the registry is created, so an invalid one fails at startup with
`ResiliencePolicyConfigurationError`, and is shared by every caller: a circuit breaker tracks
the dependency, whichever operation calls it.

The package re-exports cockatiel's outcome errors (`BrokenCircuitError`,
`BulkheadRejectedError`, `TaskCancelledError` and their guards), so callers can detect them
without importing cockatiel.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-resilience/)
