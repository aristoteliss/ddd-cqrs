# CQRS-DDD

Reusable behavior pipelines for TypeScript functions and CQRS handlers, with optional DDD
building blocks and a NestJS adapter.

[![@cqrs-ddd/pipeline on npm](https://img.shields.io/npm/v/%40cqrs-ddd%2Fpipeline?label=%40cqrs-ddd%2Fpipeline)](https://www.npmjs.com/package/@cqrs-ddd/pipeline)
[![Verification on master](https://github.com/aristoteliss/ddd-cqrs/actions/workflows/verify.yml/badge.svg?branch=master)](https://github.com/aristoteliss/ddd-cqrs/actions/workflows/verify.yml)

Add validation, authorization, caching and idempotency around application operations.
Start with a function, add command and query buses when they help, or keep your existing
NestJS application.

This repository is `ddd-cqrs`; its packages install from the npm scope `@cqrs-ddd/*`. They
need Node.js 22.12 or later (`@cqrs-ddd/mikro-orm` 22.17) and no framework or
dependency-injection container. They are
dual-licensed, AGPLv3 or commercial: see
[License and Commercial Use](#license-and-commercial-use).

**Documentation:** [site](https://aristoteliss.github.io/ddd-cqrs/) · [getting started](https://aristoteliss.github.io/ddd-cqrs/getting-started/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/)

## A first example

Requires Node.js 22.12 or later. In an empty directory:

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

```bash
node create-order.mjs
```

It prints `{ id: 'ord_123', status: 'created' }` for the valid order and
`Invalid order rejected before the function ran` for the invalid one. `logging()` reports
both calls, the rejected one on standard error with its stack; the process exits with
code 0. The function returns an object and stores nothing: no database, no framework and
no build step. [Getting started](https://aristoteliss.github.io/ddd-cqrs/getting-started/)
takes the same pieces one at a time.

## How a call runs

```text
call ──► logging ──► validation ──► cache ──► your function
                                      │
                                      └─ hit: the stored result returns, the function does not run

result ◄──────────── returns through the same behaviors, in reverse ◄────────────
```

Each behavior receives the call and the rest of the chain: it acts before, after, or
instead of what follows. The order above is one example. A behavior that needs a place
relative to another declares it, and a chain that breaks such a rule fails when it is
configured, not when it runs: see [execution order](https://aristoteliss.github.io/ddd-cqrs/concepts/execution-order/).

## Choose a path

| You have | Start with | Install |
| --- | --- | --- |
| Functions or class methods, on plain Node.js, Express or Fastify | [Getting started](https://aristoteliss.github.io/ddd-cqrs/getting-started/) | `@cqrs-ddd/pipeline` |
| Commands, queries and events, without a framework | [The `@cqrs-ddd/cqrs` quick example](https://aristoteliss.github.io/ddd-cqrs/packages/cqrs/#quick-example) | `@cqrs-ddd/cqrs` `@cqrs-ddd/pipeline` |
| A NestJS application on `@nestjs/cqrs` | [The adapter's minimal setup](https://aristoteliss.github.io/ddd-cqrs/packages/nestjs/#minimal-setup) | `@cqrs-ddd/nestjs` `@cqrs-ddd/pipeline` `@cqrs-ddd/core` |
| A NestJS application on `@nestjs-pipeline/*` 0.4.x | [From @nestjs-pipeline 0.4.x](https://aristoteliss.github.io/ddd-cqrs/guides/from-nestjs-pipeline/) | `@cqrs-ddd/nestjs` and the `@cqrs-ddd/pipeline-*` successors |

The domain building blocks are a separate, optional path: [`@cqrs-ddd/core`](https://aristoteliss.github.io/ddd-cqrs/packages/core/)
gives aggregates, domain events and repository contracts and depends on no pipeline
package. See [DDD without a framework](https://aristoteliss.github.io/ddd-cqrs/guides/ddd/).

## How it relates to what you already use

| Choice | Its responsibility | How CQRS-DDD relates |
| --- | --- | --- |
| Plain functions and your own wrappers | Application logic, composed by hand | Often enough. A library earns its place when it removes real repetition or configuration risk. |
| Express or Fastify middleware | The HTTP request and response | Keep it for HTTP concerns. A pipeline wraps the operation, so the same behaviors run when a worker or a script calls it. |
| `@nestjs/cqrs` | Commands, queries and events inside NestJS | `@cqrs-ddd/nestjs` runs behavior pipelines around its handlers; the buses stay those of NestJS. |
| `@cqrs-ddd/cqrs` | Buses and handler pipelines without a framework | It has the handler decorators and bus names of `@nestjs/cqrs`, not [every feature](https://aristoteliss.github.io/ddd-cqrs/guides/from-nestjs/#what-is-not-included). |
| A dependency-injection container | Constructing and resolving dependencies | A different responsibility. These packages need no container; an application wires them as it likes. |

## Packages

| Family | Packages under `@cqrs-ddd/` |
| --- | --- |
| Pipeline engine | `pipeline` |
| Behaviors | `pipeline-zod` (validation), `pipeline-casl` (authorization), `pipeline-cache`, `pipeline-idempotency`, `pipeline-rate-limit`, `pipeline-resilience`, `pipeline-feature-flags`, `pipeline-audit`, `pipeline-deadletter`, `pipeline-opentelemetry` |
| Context | `pipeline-tenant`, `pipeline-correlation`, `pipeline-job-context` |
| CQRS buses | `cqrs` |
| NestJS adapter | `nestjs` |
| Domain | `core`, `mikro-orm` |
| Utilities | `uuidv7`, `safe-stringify`, `untyped` |

Every package has a page on the [documentation site](https://aristoteliss.github.io/ddd-cqrs/overview/).

## Before you adopt it

- **Idempotency deduplicates; it is not exactly-once execution.** A handler can run again
  for a key after its record expires or its process stops:
  [guarantees and limits](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-idempotency/#guarantees-and-limits).
- **Events are delivered in process.** The `EventBus` of `@cqrs-ddd/cqrs` is not durable
  messaging and not an outbox.
- **Runtimes.** The test suites run on Node.js. The release check also loads every entry
  point in Bun; no other runtime is tested. `@cqrs-ddd/mikro-orm` needs Node.js 22.17 or
  later, as MikroORM does.
- **NestJS.** `@cqrs-ddd/nestjs` is this project's adapter for NestJS. It is not
  affiliated with or endorsed by the NestJS maintainers.
- **License.** AGPLv3 or commercial, for every package: read
  [License and Commercial Use](#license-and-commercial-use) before you install.

## Repository layout

| Path | Holds |
| --- | --- |
| `packages/` | The published `@cqrs-ddd/*` packages, each with its own README |
| `api/` | The example application: users, roles and sessions on every package together |
| `integration/` | Repository-wide checks, and small applications that use one package family at a time (see its README) |
| `docs/` | The documentation site |
| `biome/plugins/` | The Grit plugins that guard the package boundaries |
| `scripts/` | Generator and validator of the agent context files |
| `tools/local-registry/` | A local npm registry in Docker, to install the packages elsewhere before they are published |

## Development

Requirements: Node.js 22.17 or later (the repository's tooling and `@cqrs-ddd/mikro-orm`
need it; the other packages run from 22.12), pnpm 9 or later, and Bun on `PATH` for the
release check.

```bash
pnpm install
pnpm verify:all   # lint, tests, build, release check
```

### Releasing

Every package is released in lockstep, at one version.

1. Try the packages where they are used before publishing: publish them to the local
   registry (`tools/local-registry/`, whose README holds the commands) and install them
   there, in nestjs-pipeline's `api` for example.
2. On a clean, up-to-date `master`: `pnpm install --frozen-lockfile`, `pnpm verify:all`,
   `npm whoami`, then `pnpm publish:all`. It copies the license files and publishes every
   package on the default `latest` tag; each rebuilds in `prepublishOnly`, and
   `pnpm publish` skips a version already on the registry. The trial of step 1 replaces a
   `next` tag: npm takes the README of a package's page from the version published as
   `latest`, and moving `latest` to a version published under another tag leaves the page
   without one.
3. Tag each package as `<name>@<version>` and the release as `v<version>`, then push the
   tags; pushing `master` redeploys the documentation site.
4. Projects that tried the local registry re-resolve the packages from npm
   (`pnpm update "@cqrs-ddd/*"`): a rebuilt tarball has a different integrity hash.

## License and Commercial Use

This software is **Dual-Licensed**.

By default, this project is licensed under the **GNU AGPLv3** (see the `LICENSE` file). You can use, modify, and distribute it freely, provided your entire application is also open-sourced under the AGPLv3.

**Commercial License (No AGPL Restrictions)**

If you are using this software commercially and cannot (or do not want to) open-source your application under the AGPLv3, you must use the **Commercial License** (see `COMMERCIAL_LICENSE.txt`).
