---
title: Getting started
description: Install @cqrs-ddd/pipeline, create a pipeline and wrap a function and a method.
---

## Install

```bash
pnpm add @cqrs-ddd/pipeline
```

The packages require Node.js 22.12 or later, or another runtime with `AsyncLocalStorage`
(Bun, Deno). They are published as ES modules; a CommonJS application loads them with
`require()`.

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

export const getPrice = pipeline.wrap({ name: 'getPrice', kind: 'query' })(
  async (sku: string) => prices.find(sku),
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
)(async (order) => orders.place(order));
```

## Next

- [How an operation is wrapped](/ddd-cqrs/concepts/wrapping/): names, kinds and requests.
- [The plain Node.js guide](/ddd-cqrs/guides/plain-node/): a complete, tested example.
- [Packages](/ddd-cqrs/packages/pipeline/): every behavior and its options.
- [CQRS without NestJS](/ddd-cqrs/guides/cqrs/): an application of commands, queries and
  events on `@cqrs-ddd/cqrs`, wired with `createCqrs()`.
- [The repository's applications](https://github.com/aristoteliss/ddd-cqrs/tree/master/integration): small applications that each use one package
  family (the pipeline alone, the domain alone, the repositories alone), and `api/`,
  which uses them all.
