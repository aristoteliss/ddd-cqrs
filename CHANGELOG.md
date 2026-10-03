# Changelog

## 0.5.0

The first release. Every package is released at 0.5.0, first under the `next` dist-tag.

### Added

- `@cqrs-ddd/pipeline`: a pipeline engine with no framework and no dependency-injection
  container. `createPipeline({ behaviors, globalBehaviors, sources, diagnostics, logger })`
  configures behaviors once; `pipeline.wrap(options, ...entries)` wraps a plain function
  or decorates a method, with TypeScript's standard decorators or `experimentalDecorators`.
  Behavior contracts are checked when a function is wrapped. `LoggingBehavior` and
  `logging()` are included, and `pinoLogger(pino)` adapts a pino logger to every logger
  parameter.
- Behavior packages, each a plain class with an entry helper: `@cqrs-ddd/pipeline-zod`,
  `-casl`, `-cache`, `-idempotency`, `-rate-limit`, `-resilience`, `-feature-flags`,
  `-audit`, `-deadletter` and `-opentelemetry`. Packages whose errors have an HTTP meaning
  (zod, casl, idempotency, rate-limit, feature-flags) provide `toHttpResponse(error)` in
  an `/http` entry point.
- Context packages: `@cqrs-ddd/pipeline-tenant`, `@cqrs-ddd/pipeline-correlation` and
  `@cqrs-ddd/pipeline-job-context`, with context sources for `createPipeline({ sources })`.
- `@cqrs-ddd/cqrs`: `@CommandHandler`, `@QueryHandler`, `@EventsHandler`, `@UsePipeline`
  and `@SkipPipeline` on handler classes, and `createCqrs()`, which builds the
  `CommandBus`, `QueryBus`, `EventBus`, `EventPublisher` and `UnhandledExceptionBus` and
  registers handler instances, each with its pipeline. No container: the application
  builds its handlers with `new`.
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

