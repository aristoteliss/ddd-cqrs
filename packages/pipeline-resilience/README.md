# @cqrs-ddd/pipeline-resilience

Retry, timeout and bulkhead policies around an operation, and named policies (retry,
circuit breaker, timeout, fallback) for outbound dependencies, for `@cqrs-ddd/pipeline`,
built on [cockatiel](https://github.com/connor4312/cockatiel). A retried command must be
declared replay-safe; a misconfiguration fails when the function is wrapped.

**Documentation:** [guide](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-resilience/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/cqrs-ddd/pipeline-resilience/) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-resilience @cqrs-ddd/pipeline cockatiel
```

Requires Node.js 22.12 or later. Published as an ES module; a CommonJS application loads
it with `require()`.

## Example

```ts
export const lookup = pipeline.wrap(
  { name: 'lookup', kind: 'query' },
  resilience({ retry: { maxAttempts: 2 }, handle: (e) => e instanceof TransientError }),
)(async (id: string) => catalog.find(id));

const policies = new ResiliencePolicies({
  paymentsApi: { handleAllErrors: true, timeout: { duration: 3_000 } },
});
await policies.execute('paymentsApi', () => payments.charge(order));
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See `LICENSE` and
`COMMERCIAL_LICENSE.txt`.
