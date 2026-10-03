# @cqrs-ddd/pipeline-idempotency

Idempotency for `@cqrs-ddd/pipeline`: a command runs once per operation key, a duplicate
gets the stored response, a key reused with another payload is refused, and with a
replay scope a response is replayed only to a caller authorized under the same scope.
Memory, Redis and PostgreSQL stores are included; `toHttpResponse()` from
`@cqrs-ddd/pipeline-idempotency/http` turns a conflict into a 409 or 422 answer.

**Documentation:** [guide](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-idempotency/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/cqrs-ddd/pipeline-idempotency/) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-idempotency @cqrs-ddd/pipeline
```

Requires Node.js 22.12 or later. Published as an ES module; a CommonJS application loads
it with `require()`.

## Example

```ts
const pipeline = createPipeline({
  behaviors: [new IdempotencyBehavior(new MemoryIdempotencyStore())],
});

export const charge = pipeline.wrap(
  { name: 'charge', kind: 'command' },
  idempotent({ keyFactory: (context) => (context.request as { key: string }).key }),
)(async (input: { key: string; amount: number }) => payments.charge(input));
```

An idempotency key is an operation identity: partition it by tenant and principal, for
example with `createPartitionedIdempotencyKeyFactory()`.

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See `LICENSE` and
`COMMERCIAL_LICENSE.txt`.
