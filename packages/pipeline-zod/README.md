# @cqrs-ddd/pipeline-zod

Zod validation for `@cqrs-ddd/pipeline`. `validated(schema)` checks a wrapped function's
input and hands the function the parsed copy (coerced values, defaults, unknown keys
removed) without changing the caller's value; `createCommand()`, `createQuery()` and
`createZodRequest()` build request classes that carry their schema, validated in place by
`ZodValidationBehavior`. `toHttpResponse()` from `@cqrs-ddd/pipeline-zod/http` turns a
`ZodValidationError` into a 400 answer.

**Documentation:** [guide](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-zod/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/cqrs-ddd/pipeline-zod/) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-zod @cqrs-ddd/pipeline zod
```

Requires Node.js 22.12 or later. Published as an ES module; a CommonJS application loads
it with `require()`.

## Example

```ts
export const order = pipeline.wrap(
  { name: 'order', kind: 'command' },
  validated(z.object({ sku: z.string(), qty: z.coerce.number().int().positive() })),
)(async (input) => orders.place(input));
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See `LICENSE` and
`COMMERCIAL_LICENSE.txt`.
