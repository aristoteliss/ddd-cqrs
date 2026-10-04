# Codebase Map

Compact orientation map for automated and human readers. It is a starting point, not a
substitute for reading source. Sections marked *generated* are rewritten by
`scripts/update-claude-snapshot.py`; sections wrapped in `context:manual-*` markers are
preserved across regeneration and are owned by humans.

## Purpose

<!-- context:manual-start purpose -->
Framework-neutral packages of the `@cqrs-ddd` organization: Domain-Driven Design
primitives (`@cqrs-ddd/core`, `@cqrs-ddd/mikro-orm`), dependency-free utilities
(`@cqrs-ddd/uuidv7`, `@cqrs-ddd/safe-stringify`, `@cqrs-ddd/untyped`) and pipeline
behaviors (`@cqrs-ddd/pipeline`, `@cqrs-ddd/pipeline-<name>`), and the CQRS buses with
their handler decorators (`@cqrs-ddd/cqrs`). Every package runs without a framework or a
container; the `@nestjs-pipeline/*` packages of the nestjs-pipeline repository are the
NestJS adapters over them. `api/` is the real-life example application of the packages.

The DDD packages and the utilities moved from nestjs-pipeline with their history at 0.4.2;
the pipeline engine and its behavior packages were copied and made framework-neutral by
the active task `.claude/tasks/cqrs-ddd-pipeline.md`. `docs/` is the documentation site;
its guides carry the usage code as snippets.
<!-- context:manual-end purpose -->

## Repository Shape

<!-- context:generated-start repository-shape -->
- **Shape**: monorepo — workspace globs `api`, `docs`, `integration`, `packages/*` (24 workspace packages).
- **Publishable packages**: 21; private: `api`, `docs`, `integration`.
- **Runnable workspaces**: `api`, `docs`.
- **Versions**: `0.5.0`.
- **Packages**: see the Workspace packages table under Directory Map.
<!-- context:generated-end repository-shape -->

## Technology Stack

<!-- context:generated-start technology-stack -->
- **Languages** (file counts, excluded directories omitted): `.ts` 792, `.md` 74, `.grit` 7, `.mjs` 4, `.py` 3
- **Runtime engines** (root `package.json`): `node` >=22.12.0, `pnpm` >=9.0.0
- **Package manager evidence**: `pnpm-lock.yaml`.
- **Integrations**: listed with their purpose under Dependencies and Integrations.
<!-- context:generated-end technology-stack -->

## Entry Points

<!-- context:generated-start entry-points -->
| Path | Role | Invocation |
| --- | --- | --- |
| `.github/workflows/docs.yml` | CI pipeline definition | Runs in CI |
| `api/src/bootstrap.ts` | Application bootstrap / composition | workspace `ddd-cqrs-api` |
| `api/src/main.ts` | Process entry point | workspace `ddd-cqrs-api` |
| `api/src/tracing.ts` | Telemetry initialization (loaded before the framework) | workspace `ddd-cqrs-api` |
| `api/vitest.config.e2e.ts` | Referenced by a package script | `pnpm --filter ddd-cqrs-api` `test:e2e` |
| `integration/checks/release/release.mjs` | Referenced by a root script | `pnpm test:release` |
| `packages/core/index.ts` | Package public entry (barrel) | workspace `@cqrs-ddd/core` |
| `scripts/update-claude-snapshot.py` | Referenced by a root script | `pnpm context:check`; `pnpm context:update` |
| `scripts/validate-claude-context.py` | Referenced by a root script | `pnpm context:validate` |

Package public entry (barrel): `<package>/src/index.ts` in 20 workspace packages; exceptions are listed above.

Published packages additionally expose their built `main` (`dist/index.js`, produced by `pnpm build`), imported by package name.
<!-- context:generated-end entry-points -->

## Directory Map

<!-- context:generated-start directory-map -->
Only directories that carry responsibility are listed. Generated output, caches and
editor/tooling directories are excluded (see Snapshot Metadata).

| Directory | Responsibility |
| --- | --- |
| `.agents/` | Guide changes to the framework-neutral @cqrs-ddd packages — domain models, persistence lifecycle, repository and pipeline caching, short-circuit keys — preserving their contracts and race protections. |
| `.archify/` | Needs verification |
| `.claude/` | Needs verification |
| `.github/` | Needs verification |
| `api/` | The users API on @cqrs-ddd: Express and Fastify routes with Zod, the CQRS buses and pipelines, DDD aggregates and decorated repositories |
| `biome/` | Needs verification |
| `docs/` | The documentation site of the @cqrs-ddd packages. |
| `integration/` | Repository-wide checks and applications built on the packages one at a time: the Biome Grit plugin specs, the release verification, cross-package pipeline contracts, a pipeline-only payments service, a domain-only library, MikroORM repositories, a plain Node.js module, standard decorators and a NestJS application on the adapter, tested over HTTP |
| `packages/` | Workspace container — 21 package(s); see the workspace table below |
| `scripts/` | Needs verification |
| `tools/` | A Verdaccio npm registry on http://127.0.0.1:4873/, for installing the packages in another project exactly as they will be published, without publishing them to npm. @cqrs-ddd/ is served only from this registry… (from `tools/local-registry/README.md`) |

Root files: `.gitignore`, `.npmrc`, `AGENTS.md`, `CHANGELOG.md`, `CLAUDE.md`, `COMMERCIAL_LICENSE.txt`, `LICENSE`, `README.md`, `biome.json`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `skills-lock.json`, `tsconfig.base.json`

### Workspace packages

Each has a `README.md`.

| Path | Package | Source layout |
| --- | --- | --- |
| `api` | `ddd-cqrs-api` | `auths`, `common`, `http`, `persistence`, `roles`, `users` |
| `docs` | `ddd-cqrs-docs` | `content` |
| `integration` | `ddd-cqrs-integration` | `checks`, `inventory`, `library`, `members`, `nestjs`, `payments`, `plain-node`, `profiles`, `standard-decorators` |
| `packages/core` | `@cqrs-ddd/core` | `application`, `domain`, `http`, `persistence`, `types` |
| `packages/cqrs` | `@cqrs-ddd/cqrs` | flat |
| `packages/mikro-orm` | `@cqrs-ddd/mikro-orm` | `cache`, `concurrency`, `errors`, `helpers`, `interfaces`, `mapping`, `repository`, `tenancy` |
| `packages/nestjs` | `@cqrs-ddd/nestjs` | `filters`, `pipeline` |
| `packages/pipeline` | `@cqrs-ddd/pipeline` | `behaviors`, `constants`, `errors`, `helpers`, `interfaces`, `options`, `services` |
| `packages/pipeline-audit` | `@cqrs-ddd/pipeline-audit` | `constants`, `helpers`, `interfaces`, `sinks` |
| `packages/pipeline-cache` | `@cqrs-ddd/pipeline-cache` | `adapters`, `errors`, `helpers`, `interfaces` |
| `packages/pipeline-casl` | `@cqrs-ddd/pipeline-casl` | `constants`, `errors`, `helpers`, `interfaces`, `types` |
| `packages/pipeline-correlation` | `@cqrs-ddd/pipeline-correlation` | `constants`, `decorators`, `helpers`, `middlewares`, `options`, `types` |
| `packages/pipeline-deadletter` | `@cqrs-ddd/pipeline-deadletter` | `errors`, `helpers`, `interfaces`, `transports` |
| `packages/pipeline-feature-flags` | `@cqrs-ddd/pipeline-feature-flags` | `errors`, `helpers`, `interfaces` |
| `packages/pipeline-idempotency` | `@cqrs-ddd/pipeline-idempotency` | `constants`, `errors`, `helpers`, `interfaces`, `stores` |
| `packages/pipeline-job-context` | `@cqrs-ddd/pipeline-job-context` | `decorators`, `errors`, `helpers`, `interfaces` |
| `packages/pipeline-opentelemetry` | `@cqrs-ddd/pipeline-opentelemetry` | `helpers` |
| `packages/pipeline-rate-limit` | `@cqrs-ddd/pipeline-rate-limit` | `errors`, `helpers`, `interfaces` |
| `packages/pipeline-resilience` | `@cqrs-ddd/pipeline-resilience` | `errors`, `helpers`, `interfaces` |
| `packages/pipeline-tenant` | `@cqrs-ddd/pipeline-tenant` | flat |
| `packages/pipeline-zod` | `@cqrs-ddd/pipeline-zod` | `errors`, `helpers` |
| `packages/safe-stringify` | `@cqrs-ddd/safe-stringify` | flat |
| `packages/untyped` | `@cqrs-ddd/untyped` | flat |
| `packages/uuidv7` | `@cqrs-ddd/uuidv7` | flat |
<!-- context:generated-end directory-map -->

## Architecture

<!-- context:manual-start architecture -->
*Manual section — the generator never overwrites it. Verify each claim against the source
path given before relying on it.*

- **Dependency rules** (`AGENTS.md` rules 1 and 2): no package imports or declares NestJS,
  a `nestjs`-named package or `@nestjs-pipeline/*`. Pipeline packages and the DDD packages
  (`core`, `mikro-orm`) do not depend on each other; a request tells a pipeline its kind
  through the `Symbol.for('@cqrs-ddd/request-kind')` brand. Enforced by
  `biome/plugins/*-independence.grit` and the manifest checks of
  `integration/checks/release/release.mjs`.
- **Package directories** under the packages directory carry the package name without
  its scope (directory core holds `@cqrs-ddd/core`, directory pipeline-cache holds
  `@cqrs-ddd/pipeline-cache`); the plugin scopes in `biome.json` rely on these names.
- **Pipeline engine** (`packages/pipeline/src/create-pipeline.ts`): `createPipeline()` holds
  behavior instances and globals; `pipeline.wrap(options, ...entries)` wraps a function or
  decorates a method (standard and `experimentalDecorators`). It compiles a plan per
  operation and kind (`packages/pipeline/src/services/pipeline-plan.ts`), validates behavior contracts
  (`packages/pipeline/src/services/pipeline-contracts.ts`) and runs the chain in
  `AsyncLocalStorage` (`packages/pipeline/src/services/pipeline-runner.ts`). Framework adapters reuse those lower-level pieces.
- **Behavior packages**: a plain class per behavior, constructed with its port, optional
  defaults and an optional logger; an entry helper (`cache()`, `idempotent()`, …); an
  `/http` entry point with `toHttpResponse(error)` where errors have an HTTP meaning
  (casl, feature-flags, idempotency, rate-limit, zod).
- **CQRS** (`packages/cqrs/src`): `createCqrs()` builds the buses (`create-cqrs.ts`);
  `register()` compiles each handler's plan once with the engine's pieces and fills the
  dispatch tables (`registry.ts`, `dispatch.ts`); handler and pipeline decorators keep
  their metadata on the class (`decorators.ts`). No container.
- **Example application** (`api/`): routes are data with Zod schemas
  (`api/src/http/route.ts`); one `dispatch` parses and runs a route on Express or Fastify
  (`api/src/http/{dispatch,express,fastify}.ts`) inside an `Around` hook, which
  `api/src/auths/authenticate.ts` uses to bind the principal before the input is parsed.
  `api/src/mount.ts` assembles what both frameworks mount; `api/src/app.ts` builds the
  store, queues, behaviors (`GLOBAL_BEHAVIORS`), buses and handlers with `new`;
  `api/src/domain-answer.ts` maps the application's domain errors; `api/src/openapi.ts`
  writes the OpenAPI document from the route table.
- Rules for domain models, persistence and caching:
  `.agents/skills/cqrs-ddd-architecture/SKILL.md` and the nested `CLAUDE.md` of core and
  mikro-orm.
<!-- context:manual-end architecture -->

## Critical Modules

<!-- context:manual-start critical-modules -->
*Manual section — the generator never overwrites it.*

### Boundary guards — `biome/plugins/`, `biome.json`

- `test-suite`, `framework-independence`, `core-environment`, `orm-independence`,
  `pipeline-independence`, `ddd-independence` and `aggregate-identity` Grit plugins,
  each
  scoped in `biome.json`. `integration/checks/lint/biome-plugins.spec.ts` proves that every rule
  fires and that every scope holds. Do not loosen a plugin to make a change pass.

### Release check — `integration/checks/release/release.mjs`

- Packs every package and checks each tarball: required files, `dist` JavaScript and
  declarations, no test files, no README link outside the package, version, `engines.node`,
  and the manifest rules (no NestJS dependency, no dependency between pipeline and DDD
  packages, no `workspace:` range).
- Installs every package alone (nothing beyond its peers and packed dependencies may
  install; optional peers stay out) and all together,
  then loads every entry point through `require()`, `import`
  and Bun, and type-checks against `tsconfig.json` (NodeNext) and `tsconfig.bundler.json`.
### Site and runnable checks — `docs/`, `integration/`

- The guides show focused snippets, never whole files. The code they show runs in
  `integration/`: `integration/plain-node/` (`.mjs` run by `node --test` with no build),
  `integration/standard-decorators/` (a real `tsc` build with `experimentalDecorators:
  false`, then `node --test`) and `integration/profiles/` (Vitest). A change
  to that API needs the matching guide edited by hand.
- `integration/` also holds small applications that use one package family at a time,
  with coverage at 100% per file: `integration/payments/` (pipeline packages only),
  `integration/library/` (core domain only), `integration/inventory/` (core persistence
  decorators with `mikro-orm` on SQLite).
  `integration/profiles/` (pipeline and domain), `integration/members/` (domain on the
  buses) and `integration/nestjs/` (a NestJS application on `@cqrs-ddd/nestjs`, its
  `desk.e2e-spec.ts` over HTTP on Express and Fastify) complete them; `integration/checks/` holds the test-only checks (contracts, lint,
  docs, release);
  `api/test/` keeps only suites that exercise the application: `api/test/application/`
  (several modules), `api/test/e2e/` (over HTTP), `api/test/e2e/infrastructure/` (stores
  against containers) and `api/test/support/`; a spec of one module sits next to it in
  `api/src/`.
- `docs/` builds with `pnpm docs:build`; `starlight-links-validator` fails the build on a
  broken link. A package with an `/http` entry point needs `typedoc.json`
  listing every entry and `@module main` on its `index.ts`.
<!-- context:manual-end critical-modules -->

## Dependencies and Integrations

<!-- context:generated-start dependencies -->
External dependency names and declared ranges only. No credential, endpoint or
environment value is read or reproduced here.

| Integration | Packages | Declared in |
| --- | --- | --- |
| NestJS runtime — Application framework and DI container | `@nestjs/common`, `@nestjs/core` | `integration`, `packages/nestjs` |
| NestJS CQRS — Command/query/event buses wrapped by the pipeline | `@nestjs/cqrs` | `integration`, `packages/nestjs` |
| MikroORM — ORM, unit of work, migrations | `@mikro-orm/core`, `@mikro-orm/migrations` | `api`, `integration`, `packages/mikro-orm` |
| PostgreSQL — Relational backend and schema-per-tenant access | `pg`, `@mikro-orm/postgresql` | `api` |
| SQLite / libSQL — Local and test persistence backend | `@libsql/client`, `@mikro-orm/libsql` | `api`, `integration` |
| Redis — Cache and queue backend | `@keyv/redis`, `redis` | `api`, `packages/pipeline-cache` |
| BullMQ — Background jobs and dead-letter transport | `bullmq` | `api` |
| Keyv / cache-manager — Pluggable cache stores | `keyv`, `cache-manager` | `api`, `integration`, `packages/pipeline-cache` |
| OpenTelemetry — Tracing and metrics | `@opentelemetry/api`, `@opentelemetry/sdk-node` | `api`, `packages/pipeline-opentelemetry` |
| OpenFeature — Feature-flag evaluation | `@openfeature/server-sdk` | `api`, `integration`, `packages/nestjs`, `packages/pipeline-feature-flags` |
| CASL — Attribute/role based authorization | `@casl/ability` | `api`, `packages/nestjs`, `packages/pipeline-casl` |
| JOSE — JWT signing and verification | `jose` | `api` |
| Zod — Schema validation for DTOs and pipeline payloads | `zod` | `api`, `integration`, `packages/nestjs`, `packages/pipeline-zod` |
| Pino — Structured logging | `pino-http`, `pino-pretty` | `api` |
| Fastify — Alternative HTTP adapter and sessions | `@nestjs/platform-fastify`, `@fastify/secure-session` | `api`, `integration` |
| Express — Default HTTP adapter | `@nestjs/platform-express` | `integration` |
| Cockatiel — Retry, timeout and circuit-breaker policies | `cockatiel` | `packages/pipeline-resilience` |
| rate-limiter-flexible — Rate-limit counters | `rate-limiter-flexible` | `api`, `integration`, `packages/pipeline-rate-limit` |
| Vitest — Test runner | `vitest` | `api`, `integration`, `packages/core`, `packages/cqrs`, … (+19) |
| Biome — Formatter, linter and Grit plugin host | `@biomejs/biome` | root only |
| TypeScript — Language and type checker | `typescript` | `docs`, `packages/core`, `packages/mikro-orm` |

### Declared dependencies per workspace

| Workspace | Internal | External | Peers |
| --- | --- | --- | --- |
| `api` | 19 workspace packages | `@casl/ability`, `@fastify/secure-session`, `@keyv/redis`, `@mikro-orm/core`, `@mikro-orm/libsql`, `@mikro-orm/migrations`, `@mikro-orm/postgresql`, `@mikro-orm/sql`, `@openfeature/server-sdk`, `@opentelemetry/api`, … (+18) | — |
| `docs` | — | — | — |
| `integration` | — | — | — |
| `packages/core` | `@cqrs-ddd/safe-stringify`, `@cqrs-ddd/uuidv7` | — | — |
| `packages/cqrs` | — | — | `@cqrs-ddd/pipeline` |
| `packages/mikro-orm` | — | — | `@cqrs-ddd/core`, `@mikro-orm/core` |
| `packages/nestjs` | — | — | `@cqrs-ddd/core`, `@cqrs-ddd/pipeline`, `@cqrs-ddd/pipeline-casl`, `@cqrs-ddd/pipeline-correlation`, `@cqrs-ddd/pipeline-feature-flags`, `@cqrs-ddd/pipeline-idempotency`, `@cqrs-ddd/pipeline-job-context`, `@cqrs-ddd/pipeline-rate-limit`, `@cqrs-ddd/pipeline-zod`, … (+3) |
| `packages/pipeline` | `@cqrs-ddd/safe-stringify`, `@cqrs-ddd/untyped`, `@cqrs-ddd/uuidv7` | — | — |
| `packages/pipeline-audit` | `@cqrs-ddd/safe-stringify`, `@cqrs-ddd/uuidv7` | — | `@cqrs-ddd/pipeline` |
| `packages/pipeline-cache` | `@cqrs-ddd/safe-stringify` | — | `@cqrs-ddd/pipeline`, `@keyv/memcache`, `@keyv/postgres`, `@keyv/redis`, `@keyv/sqlite`, `cache-manager`, `keyv` |
| `packages/pipeline-casl` | `@cqrs-ddd/safe-stringify` | — | `@casl/ability`, `@cqrs-ddd/pipeline` |
| `packages/pipeline-correlation` | `@cqrs-ddd/untyped`, `@cqrs-ddd/uuidv7` | — | — |
| `packages/pipeline-deadletter` | `@cqrs-ddd/safe-stringify`, `@cqrs-ddd/uuidv7` | — | `@cqrs-ddd/pipeline` |
| `packages/pipeline-feature-flags` | — | — | `@cqrs-ddd/pipeline`, `@openfeature/server-sdk` |
| `packages/pipeline-idempotency` | `@cqrs-ddd/safe-stringify`, `@cqrs-ddd/untyped` | — | `@cqrs-ddd/pipeline` |
| `packages/pipeline-job-context` | — | — | — |
| `packages/pipeline-opentelemetry` | `@cqrs-ddd/untyped` | — | `@cqrs-ddd/pipeline`, `@opentelemetry/api` |
| `packages/pipeline-rate-limit` | `@cqrs-ddd/safe-stringify` | — | `@cqrs-ddd/pipeline` |
| `packages/pipeline-resilience` | — | — | `@cqrs-ddd/pipeline`, `cockatiel` |
| `packages/pipeline-tenant` | — | — | — |
| `packages/pipeline-zod` | `@cqrs-ddd/untyped` | — | `@cqrs-ddd/pipeline`, `zod` |
| `packages/safe-stringify` | — | — | — |
| `packages/untyped` | — | — | — |
| `packages/uuidv7` | — | — | — |

### Environment variables referenced in source

Names only — values are never read by the generator.

`ACCESS_TOKEN_MAX_BYTES`, `ADAPTER`, `AMQP_URL`, `API_CLIENTS`, `AUTH_LOGIN_CODE`, `AUTH_LOGIN_CODE_SHA256`, `AUTH_SHARED_LOGIN_CODE`, `AUTH_TOKEN`, `DATABASE_HOST`, `DATABASE_NAME`, `DATABASE_PASSWORD`, `DATABASE_PORT`, `DATABASE_URL`, `DATABASE_USER`, `DB_DEFAULT_SCHEMA`, `DB_ENGINE`, `JWT_ALGORITHMS`, `JWT_AUDIENCE`, `JWT_ISSUER`, `JWT_PUBLIC_KEY`, `JWT_PUBLIC_KEY_ALG`, `JWT_SECRET`, `NODE_ENV`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `PERMISSIONS_IN_ACCESS_TOKEN`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_URL`, `REGION`, `SESSION_SECRET`, `SQLITE_DATABASE_TEMPLATE`, `SQLITE_TENANTS`, `TESTCONTAINERS_RYUK_DISABLED`, `TRUST_PROXY`
<!-- context:generated-end dependencies -->

## Conventions

<!-- context:manual-start conventions -->
*Manual section — the generator never overwrites it. Naming, comments and documentation
rules live in `AGENTS.md`.*

| Area | Convention | Evidence |
| --- | --- | --- |
| Tooling | pnpm only; Biome (2 spaces, single quotes); strict `tsc` with `module: NodeNext` | `biome.json`, `tsconfig.base.json`, `CLAUDE.md` |
| Boundaries | No NestJS in any package but the adapter `packages/nestjs`; pipeline and DDD packages independent of each other | `biome/plugins/`, `integration/checks/release/release.mjs` |
| Configuration | Packages read no environment | `biome/plugins/core-environment.grit` |
| License | Every `.ts` file starts with the repository license header, by convention: no check enforces it | the files themselves |
| Commits | Conventional style: `feat(scope): …`, `fix(scope): …`, `chore: …` | the nestjs-pipeline history |
<!-- context:manual-end conventions -->

## Commands

<!-- context:generated-start commands -->
Commands are read from manifests. The generator does not execute them; treat every
row as *declared* unless you have run it yourself in this checkout.

### Root scripts (`package.json`)

| Command | Script body |
| --- | --- |
| `pnpm build` | `pnpm -r build` |
| `pnpm check` | `biome check .` |
| `pnpm clean` | `pnpm -r run clean` |
| `pnpm clean:all` | `rm -rf node_modules .tmp .cache coverage api/node_modules api/dist api/…` |
| `pnpm context:check` | `python3 scripts/update-claude-snapshot.py --check` |
| `pnpm context:update` | `python3 scripts/update-claude-snapshot.py` |
| `pnpm context:validate` | `python3 scripts/validate-claude-context.py` |
| `pnpm copy-licenses` | `node -e "const fs=require('fs'),path=require('path'),dirs=fs.existsSync…` |
| `pnpm docs:build` | `pnpm build && pnpm --filter ddd-cqrs-docs build:site` |
| `pnpm docs:dev` | `pnpm --filter ddd-cqrs-docs dev` |
| `pnpm format` | `biome check --write .` |
| `pnpm lint` | `pnpm lint:plugins && pnpm -r lint` |
| `pnpm lint:plugins` | `biome lint --only=plugin .` |
| `pnpm publish:all` | `pnpm copy-licenses && pnpm -r publish --access public` |
| `pnpm rebuild` | `pnpm -r run clean && pnpm -r build` |
| `pnpm test` | `pnpm lint:plugins && pnpm -r --no-bail test` |
| `pnpm test:build` | `pnpm -r --no-bail build` |
| `pnpm test:e2e` | `pnpm --filter ddd-cqrs-api test:e2e` |
| `pnpm test:release` | `pnpm rebuild && pnpm copy-licenses && node integration/checks/release/r…` |
| `pnpm verify:all` | `pnpm lint && pnpm test && pnpm test:build && pnpm test:release` |
| `pnpm verify:fails` | `node -e 'var l=require("node:fs"),u=require("node:path"),h=process.cwd(…` |
| `pnpm verify:log` | `node -e 'var y=require("node:child_process"),f=require("node:fs"),$=req…` |
| `pnpm verify:review` | `node -e 'var f=require("node:fs"),h=require("node:path"),k=process.cwd(…` |

### Workspace scripts

Workspaces with the same scripts share a row.

| Workspaces | Scripts |
| --- | --- |
| `api` | `build`, `clean`, `db:migrate`, `db:revert`, `lint`, `openapi`, `permissions:rebuild`, `permissions:verify`, `sessions:purge`, `start`, `start:fastify`, `test`, `test:e2e` |
| `docs` | `build:site`, `dev`, `preview` |
| `integration` | `lint`, `test` |
| `packages/core`, `packages/mikro-orm` | `build`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
| `packages/cqrs`, `packages/nestjs`, `packages/pipeline`, `packages/pipeline-audit`, `packages/pipeline-cache`, `packages/pipeline-casl`, `packages/pipeline-correlation`, `packages/pipeline-deadletter`, `packages/pipeline-feature-flags`, `packages/pipeline-idempotency`, `packages/pipeline-job-context`, `packages/pipeline-opentelemetry`, `packages/pipeline-rate-limit`, `packages/pipeline-resilience`, `packages/pipeline-tenant`, `packages/pipeline-zod`, `packages/safe-stringify`, `packages/untyped`, `packages/uuidv7` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |

### Context-management commands

| Command | Purpose |
| --- | --- |
| `pnpm context:update` | Regenerate this map (`scripts/update-claude-snapshot.py`). |
| `pnpm context:check` | Fail if the committed map is stale. |
| `pnpm context:validate` | Run all context checks (`scripts/validate-claude-context.py`). |
<!-- context:generated-end commands -->

## Testing Strategy

<!-- context:manual-start testing-strategy -->
*Manual section — the generator never overwrites it.*

- **Framework**: Vitest 5 (`globals: true`) for packages and the `integration/`
  applications, with 100% per-file coverage; `api` reports coverage without thresholds;
  `node --test` for `integration/plain-node` and `integration/standard-decorators`.
- **Standalone specs**: each behavior package has a `*.standalone.spec.ts` that runs the
  behavior on a function wrapped by `createPipeline()`; `integration/profiles/` runs a
  `CommandBaseHandler` through a pipeline (the only workspace that uses both families).
- **Example application**: `api/` unit and integration specs (`src/**/*.spec.ts`,
  `test/**/*.spec.ts`, `pnpm --filter ddd-cqrs-api test`) build first, because the CLI
  spec runs `dist`; `api/test/support/harness.ts` builds the buses over in-memory stores. The
  end-to-end suites (`test/e2e/**/*.e2e-spec.ts`, `test:e2e`, `api/vitest.config.e2e.ts`)
  boot the real application on Express and Fastify with `api/test/support/e2e-app.ts`
  against throwaway libSQL databases and Testcontainers Redis or PostgreSQL; they need
  Docker and are not part of `pnpm verify:all`.
- **NestJS adapter end to end**: `integration/nestjs/desk.e2e-spec.ts` boots a NestJS
  application on `@cqrs-ddd/nestjs` on Express and on Fastify and drives it with
  supertest; no Docker, so it runs in `pnpm test`. `integration/vitest.config.ts`
  dedupes NestJS, because the linked adapter would otherwise load its own copy.
- **Plugin specs**: `integration/checks/lint/biome-plugins.spec.ts` writes fixture files into a
  temporary directory and lints them with this repository's `biome.json` (plugin paths
  made absolute, every other rule off).
- **Release**: `pnpm test:release` needs Bun on `PATH` and at least one package.
- **Gaps**: no CI runs these checks; `pnpm verify:all` is a local responsibility.
<!-- context:manual-end testing-strategy -->

## Security and Operational Notes

<!-- context:manual-start security-notes -->
*Manual section — the generator never overwrites it. Names and mechanisms only; never a
secret value.*

- No package reads the environment (`core-environment.grit`), so no secret reaches a
  package except through its options.
- `.env*` files are gitignored and never read into context files.
- The API reads its secrets from environment variables by name only (`JWT_SECRET`,
  `SESSION_SECRET`, `AUTH_LOGIN_CODE_SHA256`, `API_CLIENTS`); its pino logger redacts the
  `authorization`, `cookie`, `x-api-key`, `x-api-id` and `set-cookie` headers
  (`api/src/common/logger.ts`).
<!-- context:manual-end security-notes -->

## Important Gotchas

<!-- context:manual-start gotchas -->
*Manual section — the generator never overwrites it. Every entry cites a source.*

- **The generated dependency table and environment variable list show fixture text.**
  NestJS, MikroORM, `pg`, libSQL, `DATABASE_URL`, `DB_DEFAULT_SCHEMA` and `REDIS_URL` appear
  there because `integration/checks/lint/biome-plugins.spec.ts` uses them in fixtures; no
  workspace declares or reads any of them.
- **`integration/checks/release/` sits outside any directory named packages on purpose.** The
  plugin scopes in `biome.json` match `**/packages/**`.
- **Packages, `integration` and the site import sibling packages from `dist`.** Run
  `pnpm build` before `pnpm lint`, `pnpm test` or `pnpm docs:build` on a fresh clone.
- **The docs workspace pins TypeScript 6.0** for TypeDoc 0.28, while packages build with
  TypeScript 7 (`docs/README.md`).
- **`api/vitest.config*.ts` externalize `packages/*/dist`.** Inlined, a spec that resets
  modules would get a second `@cqrs-ddd/core` without the tenant resolver that
  `api/vitest.setup.ts` registers.
- **`import './tracing.js'` must stay the first import of `api/src/bootstrap.ts`**, so the
  OpenTelemetry SDK patches `http` before Express or Fastify load; Biome does not reorder
  a side-effect import.
- **`pnpm test:release` cannot run on an empty workspace.** It stops with "Expected
  nonempty, unique publishable package names", and it reads the installed
  `@mikro-orm/core` manifest of the mikro-orm package for that package's `engines.node`
  (`integration/checks/release/release.mjs`).
<!-- context:manual-end gotchas -->

## Snapshot Metadata

<!-- context:generated-start metadata -->
- Generated at: 2026-10-04T16:06:33Z
- Git commit: d2d6720d8e49bbb688a459411b57e4a8c7af6df9
- Git branch: develop
- Uncommitted changes when generated: yes
- Generator: `scripts/update-claude-snapshot.py` version 1.0.0
- Snapshot status: generated — structural inspection only, no code executed
- Files inspected: 978
- Included top-level directories: `.agents`, `.archify`, `.claude`, `.github`, `api`, `biome`, `docs`, `integration`, `packages`, `scripts`, `tools`
- Excluded directory names: `.cache`, `.git`, `.gradle`, `.idea`, `.mypy_cache`, `.next`, `.nuxt`, `.parcel-cache`, `.pnpm-store`, `.pytest_cache`, `.ruff_cache`, `.svelte-kit`, `.terraform`, `.tmp`, `.tox`, `.turbo`, `.venv`, `.vscode`, `__pycache__`, `bower_components`, `build`, `coverage`, `dist`, `node_modules`, `out`, `target`, `vendor`, `venv`, `virtualenv`
- Excluded file patterns: `.env`, `.env.*`, `*.env`, `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*.jks`, `*.keystore`, `id_rsa*`, `id_ed25519*`, `*credentials*`, `*.secret`, `secrets.*`

The four volatile fields above (timestamp, commit, branch, dirty flag) are ignored by
`--check`, so routine commits do not mark the map stale; structural drift does.
<!-- context:generated-end metadata -->
