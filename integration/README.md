# ddd-cqrs-integration

Repository-wide checks, and small applications that use the `@cqrs-ddd` packages one
family at a time. `api/` is the application that uses them all together; each folder here
shows one way to use some of them without the others. Private, never published.

| Folder | What it shows | Packages |
| --- | --- | --- |
| `payments/` | A payment service on the pipeline alone: class methods with `@pipeline.wrap`, no buses and no aggregates. Authorization, rate limiting, audit, Zod validation, retries and a feature flag, with the tenant and correlation id taken from where each call entered | `pipeline` and the `pipeline-*` behavior and context packages |
| `library/` | A library's loans on the domain alone: an aggregate with value rules, `@Mutable` fields and `@ApplyMutation` methods, its events, and `CommandBaseHandler` publishing them, over an in-memory repository | `core` (domain, application, http) |
| `inventory/` | Repositories on the core persistence decorators: `@PersistedWrite`, `@Cache`, `@MapPersistenceErrors` and `@FromCache` over MikroORM on in-memory SQLite, with the cache in the same database | `core` (persistence), `mikro-orm` |
| `ddd/` | `@cqrs-ddd/core` handlers and aggregates on the `@cqrs-ddd/cqrs` buses | `core`, `cqrs` |
| `pipeline/` | Contracts between behavior packages composed on `createCqrs()`: ordering, registration diagnostics, partitioned keys, context sources | `cqrs`, `pipeline`, `pipeline-*` |
| `plain-node/` | The pipeline on plain JavaScript functions, run by `node --test` with no build | `pipeline`, `pipeline-cache`, `pipeline-idempotency`, `pipeline-zod` |
| `standard-decorators/` | The pipeline with TypeScript's standard decorators, compiled by `tsc` with `experimentalDecorators: false` | `pipeline`, `pipeline-cache`, `pipeline-tenant`, `pipeline-zod` |
| `lint/` | The Biome Grit plugins, each proven on a failing and a passing sample | — |
| `docs/` | The cache security rules the documentation must not contradict | — |
| `release/` | Packs every package and installs each one alone from its tarball (`pnpm test:release`) | all |

## Commands

```bash
pnpm --filter ddd-cqrs-integration test   # Vitest with coverage, then the node --test suites
pnpm --filter ddd-cqrs-integration lint   # type checks
```

The packages are loaded from their `dist/`, so run `pnpm build` at the repository root
first. Coverage covers the three applications, each file at 100%.
