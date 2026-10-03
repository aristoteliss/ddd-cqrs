# @cqrs-ddd/pipeline

A framework-neutral pipeline engine: wrap plain functions and class methods with
behaviors such as logging, validation, authorization, caching or idempotency. No
framework, no dependency-injection container and no CQRS infrastructure are required;
the `@cqrs-ddd/pipeline-<name>` packages provide the behaviors.

**Documentation:** [guide](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/cqrs-ddd/pipeline/) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

## Installation

```bash
pnpm add @cqrs-ddd/pipeline
```

Requires Node.js 22.12 or later, or another runtime with `AsyncLocalStorage` (Bun, Deno).
Published as an ES module; a CommonJS application loads it with `require()`.

## Example

```ts
import { createPipeline, logging } from '@cqrs-ddd/pipeline';

const pipeline = createPipeline({
  globalBehaviors: { before: [logging({ requestResponseLogLevel: 'log' })] },
});

export const getPrice = pipeline.wrap({ name: 'getPrice', kind: 'query' })(
  async (sku: string) => prices.find(sku),
);
```

A method can be decorated instead, in either TypeScript decorator mode:
`@pipeline.wrap({ kind: 'query' })`. A plain function needs a `name`, which keys and logs
use to tell operations apart, and a `kind`: a `query` reads, a `command` changes state,
an `event` reacts.

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See `LICENSE` and
`COMMERCIAL_LICENSE.txt`.
