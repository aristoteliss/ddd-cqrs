# ddd-cqrs-integration

Small applications that use the `@cqrs-ddd` packages one family at a time, and
repository-wide checks. `api/` is the application that uses them all together; each folder here
shows one way to use some of them without the others. Private, never published.

| Folder | What it shows | Packages |
| --- | --- | --- |
| `payments/` | A payment service on the pipeline alone: class methods with `@pipeline.wrap`, no buses and no aggregates. Authorization, rate limiting, audit, Zod validation, retries and a feature flag, with the tenant and correlation id taken from where each call entered | `pipeline` and the `pipeline-*` behavior and context packages |
| `library/` | A library's loans on the domain alone: an aggregate with value rules, `@Mutable` fields and `@ApplyMutation` methods, its events, and `CommandBaseHandler` publishing them, over an in-memory repository | `core` (domain, application, http) |
| `inventory/` | Repositories on the core persistence decorators: `@PersistedWrite`, `@Cache`, `@MapPersistenceErrors` and `@FromCache` over MikroORM on in-memory SQLite, with the cache in the same database | `core` (persistence), `mikro-orm` |
| `profiles/` | A domain handler wrapped by the pipeline, without buses: the code of the DDD guide, with every command audited and its events published inside the pipeline | `core`, `pipeline`, `pipeline-audit` |
| `members/` | The domain on the buses: an aggregate, its command, query and event handlers registered with `createCqrs()` | `core`, `cqrs` |
| `nestjs/` | A NestJS support desk on the adapter: `@nestjs/cqrs` handlers run through their pipelines by `PipelineModule`, package errors answered by `ErrorFilter`, requests correlated by `CorrelationMiddleware`; its end-to-end spec drives it over HTTP on Express and on Fastify | `nestjs`, `core`, `pipeline`, `pipeline-casl`, `pipeline-correlation`, `pipeline-rate-limit`, `pipeline-zod` |
| `plain-node/` | The pipeline on plain JavaScript functions, run by `node --test` with no build | `pipeline`, `pipeline-cache`, `pipeline-idempotency`, `pipeline-zod` |
| `standard-decorators/` | The pipeline with TypeScript's standard decorators, compiled by `tsc` with `experimentalDecorators: false` | `pipeline`, `pipeline-cache`, `pipeline-tenant`, `pipeline-zod` |

`checks/` holds what is a test by nature, with no application of its own:

| Folder | What it checks |
| --- | --- |
| `checks/contracts/` | Behavior packages composed on `createCqrs()`: ordering, registration diagnostics, partitioned keys, context sources, skip isolation |
| `checks/lint/` | The Biome Grit plugins, each proven on a failing and a passing sample |
| `checks/docs/` | The cache security rules the documentation must not contradict |
| `checks/release/` | Packs every package and installs each one alone from its tarball (`pnpm test:release`) |

## Commands

```bash
pnpm --filter ddd-cqrs-integration test   # Vitest with coverage, then the node --test suites
pnpm --filter ddd-cqrs-integration lint   # type checks
```

The packages are loaded from their `dist/`, so run `pnpm build` at the repository root
first. Coverage covers the applications, each file at 100%. They compile without
`emitDecoratorMetadata`, so the NestJS application names each constructor dependency
with `@Inject()`. The adapter is linked from its workspace folder; `vitest.config.ts`
dedupes NestJS so it shares the application's copy, as an installed adapter does.
