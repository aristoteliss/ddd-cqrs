---
title: "@cqrs-ddd/pipeline-resilience"
description: "Retry, timeout and bulkhead around an operation, and named policies for outbound dependencies, built on cockatiel."
sidebar:
  order: 15
---

Fault tolerance and reliability policies built on [cockatiel](https://github.com/connor4312/cockatiel), applied at two distinct architectural levels:

1. **Operation-Level Resilience (`ResilienceBehavior`)**: Wraps whole handlers or operations with **retry**, **timeout**, and **bulkhead** isolation.
2. **Outbound Dependency Policies (`ResiliencePolicies`)**: A centralized registry of named resilience policies (**circuit breakers**, **retry**, **bulkhead**, **timeout**, **fallback**) applied around outbound RPC calls, payment APIs, database queries, and third-party webhooks.

Enforces strict compile- and startup-time invariants to prevent dangerous side-effect replays.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-resilience @cqrs-ddd/pipeline
```

Requires Node.js 22.12 or later. `cockatiel` 4 comes as a dependency.

## Two Architectural Scopes

```text
Incoming Command / Query
      │
      ▼
[ResilienceBehavior] (Operation Level)
  ├─ Bulkhead: Limits concurrent operations across this handler
  ├─ Timeout: Bounds entire handler execution time
  └─ Retry: Re-runs the operation (commands and events only with replaySafe)
         │
         ▼
[Handler Business Logic]
         │
         ▼ Outbound Remote Call (e.g. Stripe, AWS S3, SendGrid)
[ResiliencePolicies] (Dependency Level)
  ├─ Circuit Breaker: Tripped on consecutive remote failures
  ├─ Outbound Timeout: Bounds network HTTP socket duration
  ├─ Outbound Retry: Retries transient network socket drops
  └─ Fallback: Returns cached or degraded response on outage
```

## Operation-Level Usage (`ResilienceBehavior`)

```typescript
import { createPipeline } from '@cqrs-ddd/pipeline';
import { resilience, getResilienceAbortSignal } from '@cqrs-ddd/pipeline-resilience';

const pipeline = createPipeline();

export const fetchRemotePrice = pipeline.wrap(
  { name: 'fetchRemotePrice', kind: 'query' },
  resilience({
    retry: {
      maxAttempts: 3,
      backoff: { type: 'exponential', initialDelay: 200, maxDelay: 2_000 },
    },
    timeout: { duration: 3_000, strategy: 'cooperative' },
    bulkhead: { limit: 20, queue: 10 },
    handle: (error) => error instanceof UpstreamNetworkError,
  }),
)(async (sku: string) => {
  const signal = getResilienceAbortSignal(); // the current attempt's cancellation signal
  return pricingApi.getPrice(sku, { signal });
});
```

### Safety Invariants & Diagnostics

Because retries re-execute everything inside the behavior, `ResilienceBehavior` validates strict safety rules:

1. **Selective Failure Filter (`handle`)**: Retries require an explicit `handle: (error) => boolean` predicate selecting transient errors (network drops, deadlocks). To intentionally retry all errors, set `handleAllErrors: true`.
2. **Replay Safety on Commands/Events (`retry.replaySafe`)**: Commands and events mutate state. Attempting to configure retries on a command without explicitly setting `retry: { replaySafe: true }` fails at startup with `PipelineConfigurationError`.
3. **Timeout Strategy & Safety (`timeout.strategy`)**:
   - `'aggressive'` (default): Immediately answers the caller with a timeout rejection while the underlying handler continues running in the background. On commands or events, requires `timeout: { replaySafe: true }`.
   - `'cooperative'`: Aborts the `AbortSignal` returned by `getResilienceAbortSignal()` and waits for the handler to settle before answering.
4. **No Circuit Breakers on Use Cases**: Declaring a circuit breaker directly on an operation handler is rejected. Circuit breakers track external dependency health, not domain use cases; declare them on `ResiliencePolicies`.

## Outbound Dependency Policies (`ResiliencePolicies`)

Create a shared registry of named policies for downstream external systems:

```typescript
import { ResiliencePolicies } from '@cqrs-ddd/pipeline-resilience';

export const externalPolicies = new ResiliencePolicies({
  paymentGateway: {
    handle: (error) => isTransientHttpError(error),
    retry: { maxAttempts: 2, backoff: { type: 'exponential', initialDelay: 500 } },
    circuitBreaker: {
      halfOpenAfter: 30_000,
      breaker: { type: 'consecutive', threshold: 5 },
    },
    timeout: { duration: 5_000 },
  },
  smsProvider: {
    timeout: { duration: 2_000 },
    bulkhead: { limit: 10, queue: 5 },
  },
});

// Executing via named policy:
const charge = await externalPolicies.execute('paymentGateway', async ({ signal }) => {
  return stripe.charges.create(chargeParams, { signal });
});
```

All callers across all handlers share the same circuit breaker state for `'paymentGateway'`, protecting downstream APIs from cascading failures.

## NestJS Integration (`@cqrs-ddd/nestjs`)

Provide `ResiliencePolicies` as an injectable service:

```typescript
import { Module, Global } from '@nestjs/common';
import { ResiliencePolicies } from '@cqrs-ddd/pipeline-resilience';

@Global()
@Module({
  providers: [
    {
      provide: ResiliencePolicies,
      useFactory: () =>
        new ResiliencePolicies({
          stripeApi: {
            handle: (error) => isTransientHttpError(error), // required by retry and circuitBreaker
            retry: { maxAttempts: 3 },
            circuitBreaker: { halfOpenAfter: 15_000, breaker: { type: 'consecutive', threshold: 3 } },
            timeout: { duration: 4_000 },
          },
        }),
    },
  ],
  exports: [ResiliencePolicies],
})
export class ResilienceModule {}
```

Decorate `@CommandHandler` with `resilience()`:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { resilience } from '@cqrs-ddd/pipeline-resilience';

@CommandHandler(SyncInventoryCommand)
@UsePipeline(
  resilience({
    retry: { maxAttempts: 3, replaySafe: true },
    timeout: { duration: 10_000, strategy: 'cooperative' },
    handle: (err) => err instanceof DatabaseDeadlockError,
  }),
)
export class SyncInventoryHandler implements ICommandHandler<SyncInventoryCommand> {
  async execute(command: SyncInventoryCommand) {
    // Retried safely on deadlock
  }
}
```

## Layer Ordering

`ResilienceBehavior` composes policies in the following default order (outermost to innermost):

```text
['retry', 'bulkhead', 'timeout']
```

Customize the execution order via `order`:

```typescript
resilience({
  order: ['bulkhead', 'retry', 'timeout'], // Bulkhead wraps retry attempts
  retry: { maxAttempts: 3 },
  bulkhead: { limit: 10 },
  timeout: { duration: 2_000 },
})
```

## Error Types & Guards

Re-exports Cockatiel error classes and predicate guards:
- `BrokenCircuitError` / `isBrokenCircuitError(err)`: Thrown when a remote call is blocked by an open circuit breaker.
- `BulkheadRejectedError` / `isBulkheadRejectedError(err)`: Thrown when concurrency limits and queue capacity are exhausted.
- `TaskCancelledError` / `isTaskCancelledError(err)`: Thrown when execution exceeds configured timeout.

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-resilience/)
