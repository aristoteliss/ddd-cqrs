---
title: Getting started
description: Run a first example, then install @cqrs-ddd/pipeline, create a pipeline and wrap a function and a method.
---

## A first run

In an empty directory, install the pipeline, the validation behavior and Zod:

```bash
pnpm add @cqrs-ddd/pipeline @cqrs-ddd/pipeline-zod zod
```

Save this as `create-order.mjs`:

```js
import { createPipeline, logging } from '@cqrs-ddd/pipeline';
import { validated, ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

const pipeline = createPipeline({
  globalBehaviors: { before: [logging({ requestResponseLogLevel: 'none' })] },
});

const order = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive(),
});

const createOrder = pipeline.wrap(
  { name: 'createOrder', kind: 'command' },
  validated(order),
)(async (input) => ({ id: input.orderId, status: 'created' }));

console.log(await createOrder({ orderId: 'ord_123', amount: 49.99 }));

try {
  await createOrder({ orderId: 'ord_bad', amount: -1 });
} catch (error) {
  if (!(error instanceof ZodValidationError)) throw error;
  console.log('Invalid order rejected before the function ran');
}
```

Run it:

```bash
node create-order.mjs
```

Standard output shows the logged call, the result of the valid order and the rejection of
the invalid one. The correlation id and the duration differ on every run:

```text
[0199c2d4-…] COMMAND createOrder → createOrder completed in 1.08ms createOrder
{ id: 'ord_123', status: 'created' }
Invalid order rejected before the function ran
```

`logging()` also reports the rejected call on standard error, as `createOrder failed` with
the `ZodValidationError` and its stack. That is the log of the failure the example
provokes; the process exits with code 0. The function returns an object and stores
nothing: there is no database, no framework and no build step.

The rest of this page takes the same pieces one at a time.

## Install

```bash
pnpm add @cqrs-ddd/pipeline
```

The packages require Node.js 22.12 or later; `@cqrs-ddd/mikro-orm` requires 22.17 or
later, as MikroORM 7 does. The release check also loads every entry
point in Bun; the test suites run on Node.js only, and no other runtime is tested. The
packages are published as ES modules; a CommonJS application loads them with `require()`.

## Create a pipeline

A pipeline holds the behavior instances and the behaviors that apply to every operation.
Create it once, in a module of its own:

```ts
// pipeline.ts
import { createPipeline, LoggingBehavior, logging } from '@cqrs-ddd/pipeline';

export const pipeline = createPipeline({
  behaviors: [new LoggingBehavior(console)],
  globalBehaviors: { before: [logging({ requestResponseLogLevel: 'log' })] },
});
```

`behaviors` are the instances, one per behavior class; a behavior placed without an
instance is constructed with no arguments. `globalBehaviors` places behaviors around every wrapped
operation.

## Wrap a function

`pipeline.wrap(options, ...entries)` returns a wrapper. Applied to a function, it returns a
new async function that runs the behaviors around it:

```ts
import { pipeline } from './pipeline.js';

const prices = new Map([
  ['apple', 120],
  ['pear', 90],
]);

export const getPrice = pipeline.wrap({ name: 'getPrice', kind: 'query' })(
  async (sku: string) => prices.get(sku),
);

await getPrice('apple');
```

A plain function needs a `name`, which keys and logs use to tell operations apart, and a
`kind`: a `query` reads, a `command` changes state, an `event` reacts. Behaviors use the
kind to decide what applies; idempotency, for example, applies to commands.

## Decorate a method

The same wrapper decorates a method, with TypeScript's standard decorators or with
`experimentalDecorators`:

```ts
class Prices {
  private readonly store = new Map([['apple', 120]]);

  @pipeline.wrap({ kind: 'query' })
  async find(sku: string) {
    return this.store.get(sku);
  }
}
```

A method is named `Class.method` (here `Prices.find`) unless the options name it.

## Add a behavior

Each concern is a package. Install it, give the pipeline an instance, and add its entry
where it applies:

```bash
pnpm add @cqrs-ddd/pipeline-zod zod
```

```ts
import { validated } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

export const placeOrder = pipeline.wrap(
  { name: 'placeOrder', kind: 'command' },
  validated(z.object({ sku: z.string(), qty: z.coerce.number().int().positive() })),
)(async (order) => ({ ...order, status: 'placed' }));
```

## Next

- [How an operation is wrapped](/ddd-cqrs/concepts/wrapping/): names, kinds and requests.
- [The plain Node.js guide](/ddd-cqrs/guides/plain-node/): a complete, tested example.
- [Packages](/ddd-cqrs/packages/pipeline/): every behavior and its options.
- [CQRS without NestJS](/ddd-cqrs/guides/cqrs/): an application of commands, queries and
  events on `@cqrs-ddd/cqrs`, wired with `createCqrs()`.
- [NestJS & @cqrs-ddd](/ddd-cqrs/guides/from-nestjs/): integrating with NestJS using
  [`@cqrs-ddd/nestjs`](/ddd-cqrs/packages/nestjs/).
- [The repository's applications](https://github.com/aristoteliss/ddd-cqrs/tree/master/integration): small applications that each use one package
  family (the pipeline alone, the domain alone, the repositories alone), and `api/`,
  which uses them all.
