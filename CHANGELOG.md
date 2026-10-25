# Changelog

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

