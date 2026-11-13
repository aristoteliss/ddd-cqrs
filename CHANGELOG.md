# Changelog

## 0.6.0

A minor release with breaking changes, defect repairs and simplifications across the
packages. Every package is released at 0.6.0 on the `latest` dist-tag. The packages take
each other at `^0.6.0`, as every release moves in lockstep. Read the breaking changes
before you upgrade from 0.5.x.

### Breaking changes

- `@cqrs-ddd/core`: `requireTenantId(source, purpose)` is removed; call
  `requireTenant(purpose, source)`.
- `@cqrs-ddd/core`: `BaseCommand` and `BaseQuery` no longer set `sessionUser`, a second
  name for the same value; read `sessionPrincipal`.
- `@cqrs-ddd/nestjs`: the options type of `PipelineModule.forRoot()` is
  `PipelineModuleOptions`; the adapter no longer exports a `PipelineOptions`, which is the
  name of the `createPipeline` options in `@cqrs-ddd/pipeline`.

- `@cqrs-ddd/pipeline-idempotency`: `IdempotencyConflictError.statusCode` is removed; an
  error carries no transport semantics. `toHttpResponse` of
  `@cqrs-ddd/pipeline-idempotency/http` maps `reason` to the status. Its body is
  `{ statusCode, error, message, reason }`: it no longer has `idempotencyKey`, and
  `message` is a fixed text for each reason, because the stored key holds the tenant and
  the principal.
- `@cqrs-ddd/pipeline-rate-limit/http`: `message` in the body of `toHttpResponse` no longer
  names the bucket key, for the same reason.

- `@cqrs-ddd/pipeline-feature-flags`: the constructor is
  `new FeatureFlagBehavior(client, defaults?, logger?)`, as the other behaviors. The
  evaluation context of every operation moves to the option `baseContext`, and the
  targeting key factory to `targetingKeyFactory`, both in the defaults.

- `@cqrs-ddd/pipeline-deadletter`: `DeadLetterStore` has a new required method
  `claim(id, leaseMs)`, and `recordAttempt` and `markResolved` end the claim. A custom
  store must implement it. `PostgresDeadLetterTransport` needs the columns `claimed_until`
  and `tenant_id`: run `createDeadLetterTableSql()` again, which adds them to an existing
  table.

- The pipeline packages no longer export the raw symbol of a context item, such as
  `CACHE_HIT_ITEM` or `IDEMPOTENCY_REPLAYED_ITEM`. Read each item through its typed token
  with `getPipelineItem(context, CACHE_HIT_ITEM_TOKEN)`. This removes 12 exports of
  `pipeline-audit`, `-cache`, `-deadletter`, `-feature-flags`, `-idempotency` and
  `-rate-limit`.

### Changed

- Example application `api/`: a refresh writes an audit record, action `auth.refresh`, with
  the refresh token redacted. A failed refresh, such as a reused token, is recorded too.
- Example application `api/`: `POST /roles` needs the permission to create a role only.
  Before, it also needed the permission to read users.
- Example application `api/`: the user bodies of `POST /users`, `PATCH /users/:id`,
  `GET /users` and `GET /users/:id` name the field `username`, as
  `GET /users/:id/overview` does. Before, they named it `name`.
- `@cqrs-ddd/pipeline-casl`: a handler that places `CaslBehavior` itself without `rules`
  is a contract violation; before, it ran with no check. A global placement without rules
  still passes through.
- `@cqrs-ddd/cqrs`, `@cqrs-ddd/nestjs`: a contract violation in `'warn'` mode is logged as
  `[Pipeline Diagnostic] '<handler>' with behavior ...`, without the word `Handler`.

### Fixed

- `@cqrs-ddd/pipeline-deadletter`: when the store cannot record a failed redrive attempt,
  `redrive` still throws the handling error. The new option `logger` gets the store error.
  Before, the store error replaced the handling error.
- `@cqrs-ddd/mikro-orm`: under `'schema'` isolation, `TenantStore.em` no longer reuses a
  contextual manager that has no schema. Before, such a manager ran the statements of a
  tenant on the default schema.
- `@cqrs-ddd/safe-stringify`: `stableStringify` and `toStrictJsonValue` refuse a boxed
  primitive and an iterable object without `toJSON()`, such as `URLSearchParams` or
  `Headers`. Before, each one became `{}`, so two different requests could share a cache
  key or an idempotency fingerprint.
- `@cqrs-ddd/pipeline-deadletter`: `DeadLetterRedriver` claims the record before it
  dispatches. Before, two redrives of one record at the same time both ran the handler.
  The new option `leaseMs` (default five minutes) sets how long a claim holds when a
  process stops during the handling.
- `@cqrs-ddd/core`: `@Cache` write-through invalidates the key when its fenced fill is
  rejected. Before, a reader that filled the key during the save could leave its older
  snapshot until the TTL.
- `@cqrs-ddd/pipeline-correlation`: `@WithCorrelation` runs a method that is called without
  its instance; before, it threw a `TypeError`.
- `@cqrs-ddd/nestjs`: a second `PipelineModule.forRoot()` fails at startup instead of
  wrapping every handler twice; a behavior with `PIPELINE_BEHAVIOR_ID` resolves from the
  provider of another copy of its class; `ErrorFilter` leaves an error that is only named
  `ZodValidationError` to Nest.

### Added

- `@cqrs-ddd/core`: `CommandBaseHandler.publishEvents(aggregate)`, protected, publishes and
  clears the events of an aggregate that `handle` saved before it throws. `execute` uses
  the same step for the aggregate that `handle` returns.
- `@cqrs-ddd/pipeline-rate-limit`: `createPartitionedRateLimitKeyFactory<TRequest>` and
  `RateLimitPartitionFactory<TRequest>` type `context.request`, so a partition factory
  needs no cast.
- `@cqrs-ddd/pipeline-deadletter`: `PostgresDeadLetterTransport` stores the tenant in the
  column `tenant_id`, and `list({ tenantId })` returns the records of one tenant. A row
  without the column value still reads its tenant from `metadata.tenantId`.
- `@cqrs-ddd/pipeline`: `assertSafeTable` and the type `PostgresQueryableLike`, which the
  Postgres stores of the audit, dead-letter and idempotency packages share. Each package
  still exports its `PostgresQueryableLike`.
- `@cqrs-ddd/pipeline`: the type `HttpResponse`, which the `http` entry point of each
  pipeline package returns and exports again.
- `@cqrs-ddd/pipeline`: `behaviorDiagnostic`, which builds the diagnostic a contract
  validator returns.
- `@cqrs-ddd/pipeline`: `principalSegments`, the principal segment rule that the cache,
  idempotency and rate-limit key factories share.
- `@cqrs-ddd/pipeline`: `createBehaviorResolver`, `compileHandlerPlan`,
  `createHandlerRunner` and `reportDiagnostics`, the bootstrap steps that `createPipeline`,
  `createCqrs` and the NestJS adapter share.

## 0.5.2

A patch release with a security fix and one opt-in addition in
`@cqrs-ddd/pipeline-correlation`; the other packages have no code change. Every package is
released at 0.5.2 on the `latest` dist-tag. `@cqrs-ddd/mikro-orm` and `@cqrs-ddd/nestjs`
take the other `@cqrs-ddd` packages at `^0.5.2`, as every release moves in lockstep.

### Fixed

- `@cqrs-ddd/pipeline-correlation`: every write to the correlation store first requires a
  string of printable ASCII (0x20 to 0x7E) without leading or trailing spaces, and no
  option turns that check off. `runWithCorrelationId` and `@WithCorrelation` keep the
  current id or generate one instead of storing a failing id, and `correlationSource.run`
  runs without one. Before, they stored any non-empty value, so an id from a queue message
  or a gRPC or Kafka header could carry CR/LF into the logs and the response headers.
  `validateIncoming` of `httpCorrelation` sees only ids that pass the check.

### Added

- `@cqrs-ddd/pipeline-correlation`: `configureCorrelation({ maxLength, validateIncoming,
  onRejected })` sets, once for the process, the rules every incoming correlation id must
  pass in `httpCorrelation`, `runWithCorrelationId`, `@WithCorrelation` and
  `correlationSource.accepts`, which job contexts use. `onRejected` receives each replaced
  id as a `CorrelationRejection`: `{ reason, source, length }`, without the id itself.
  It is opt-in: until an application calls it, `runWithCorrelationId` and
  `@WithCorrelation` apply only the built-in check, and `httpCorrelation` and `accepts`
  keep their default rule (at most 128 characters matching
  `DEFAULT_CORRELATION_ID_PATTERN`). Calling it, even as `configureCorrelation({})`,
  applies that rule to every entry point.

### Changed

- `@cqrs-ddd/pipeline-correlation`: `httpCorrelation` reads the configured rules on each
  request and runs the request with the id it chose without checking that id again, so an
  id it generates is never rejected by an application rule.

## 0.5.1

A patch release. No export, signature, error message or documented behavior changes. Every
package is released at 0.5.1 on the `latest` dist-tag.

### Changed

- The source of every package is reorganized for readability: long functions split into
  named steps where that reads better, early exits instead of nested blocks, and one blank
  line between the steps of a function. The order of every read, check, write and `await`
  in the cache, idempotency and concurrency code is unchanged. Some exported classes have
  new private members; a subclass that declares a member of the same name no longer
  compiles.
- The packages are developed and tested against the latest releases of their peers within
  the declared ranges: NestJS 12.2, `@nestjs/cqrs` 12.1.1, MikroORM 7.2.5, zod 4.6.7,
  `@casl/ability` 7.0.2, `@opentelemetry/api` 1.10.0 and `rate-limiter-flexible` 11.2.3.
  No peer range changes.
- `@cqrs-ddd/mikro-orm` and `@cqrs-ddd/nestjs` take the other `@cqrs-ddd` packages at
  `^0.5.1`, as every release moves in lockstep.

### Documentation

- The Node.js minimum names its exception everywhere it is stated: `@cqrs-ddd/mikro-orm`
  needs 22.17, the other packages 22.12. Developing in the repository needs 22.17.
- `MemoryIdempotencyStore` and `IdempotencyBehavior` no longer call the memory store the
  default: the behavior's constructor requires a store.

### Example application (`api/`, not published)

- A refresh runs on the command bus as `RefreshAuthCommand`, with its rate limit as a
  pipeline entry and no dead-letter capture. Login is `StartAuthCommand`, which records
  `AuthStartedEvent`; renaming a role is `RenameRoleCommand`, which records
  `RoleRenamedEvent`. The HTTP routes, bodies, statuses and audit actions are unchanged;
  logs and metrics name the new commands.
- The OpenTelemetry SDK 0.300 replaces 0.222. BullMQ stays on 5.

## 0.5.0

The first release. Every package is released at 0.5.0, first under the `next` dist-tag.

### Added

- `@cqrs-ddd/pipeline`: a pipeline engine with no framework and no dependency-injection
  container. `createPipeline({ behaviors, globalBehaviors, sources, diagnostics, logger })`
  configures behaviors once; `pipeline.wrap(options, ...entries)` wraps a plain function
  or decorates a method, with TypeScript's standard decorators or `experimentalDecorators`.
  Behavior contracts are checked when a function is wrapped. `LoggingBehavior` and
  `logging()` are included, and `pinoLogger(pino)` adapts a pino logger to every logger
  parameter. `@UsePipeline` and `@SkipPipeline` declare the behaviors of a handler class,
  and `pipelineOf()` reads them for a handler runtime.
- Behavior packages, each a plain class with an entry helper: `@cqrs-ddd/pipeline-zod`,
  `-casl`, `-cache`, `-idempotency`, `-rate-limit`, `-resilience`, `-feature-flags`,
  `-audit`, `-deadletter` and `-opentelemetry`. Packages whose errors have an HTTP meaning
  (zod, casl, idempotency, rate-limit, feature-flags) provide `toHttpResponse(error)` in
  an `/http` entry point.
- Context packages: `@cqrs-ddd/pipeline-tenant`, `@cqrs-ddd/pipeline-correlation` and
  `@cqrs-ddd/pipeline-job-context`, with context sources for `createPipeline({ sources })`.
- `@cqrs-ddd/cqrs`: `@CommandHandler`, `@QueryHandler` and `@EventsHandler` on handler
  classes, and `createCqrs()`, which builds the `CommandBus`, `QueryBus`, `EventBus` and
  `UnhandledExceptionBus` and registers handler instances, each with its pipeline. No container: the application
  builds its handlers with `new`.
- `@cqrs-ddd/nestjs`: the NestJS adapter, the only package with NestJS (as peers).
  `PipelineModule.forRoot()` runs official `@nestjs/cqrs` handlers through their
  pipelines, taking each behavior from the module that provides it; `ErrorFilter` answers
  every package error as a NestJS `HttpException`; `./correlation` and `./job-context`
  wire correlation ids and job context.
- `createZodMapper(schema)` in `@cqrs-ddd/pipeline-zod`: parses input into a command at
  the HTTP edge and throws `ZodValidationError`.
- `@cqrs-ddd/core`: `BaseCommand`, `BaseQuery` and `DomainEvent` carry the
  `Symbol.for('@cqrs-ddd/request-kind')` brand, so a pipeline takes the kind and the name
  of an operation from its request. Neither package depends on the other.
- The documentation site, https://aristoteliss.github.io/ddd-cqrs/.
- An example application in the repository (`api/`, not published): users, roles and
  sessions served by Express or Fastify routes with Zod on `createCqrs()`, with every
  behavior package, MikroORM repositories and BullMQ jobs, and end-to-end suites on both
  frameworks.

