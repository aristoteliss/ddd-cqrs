# Conventions

How the DDD/CQRS code in this repository is laid out and named, as the code does it today.
When this file and the code disagree, the code wins; correct this file.

## Folder layout

The example application is organized by bounded context first, then by layer.

```text
api/src/
├── app.ts                  composition root: createApp() builds every handler with `new`
├── routes.ts               concatenates each context's routes
├── domain-answer.ts        the application's domain exceptions → HTTP answers
├── common/                 shared constants, validation schemas, pipeline option factories
├── http/                   route definition, dispatch, Express and Fastify adapters
├── persistence/            MikroORM schemas, join-table entities, migrations, store
└── <context>/              users | roles | auths
    ├── domain/
    │   ├── models/         <noun>.entity.ts (aggregate and child entities)
    │   │   └── errors/     <name>.exception.ts
    │   └── events/         <noun>-<past-verb>.event.ts
    ├── application/
    │   ├── cqrs/
    │   │   ├── commands/   <verb>-<noun>.command.ts and <verb>-<noun>.handler.ts
    │   │   ├── queries/    get-<noun>.query.ts and get-<noun>.handler.ts
    │   │   └── events/     <noun>-<past-verb>.handler.ts
    │   ├── ports/          <capability>.port.ts
    │   ├── results/        <noun>.result.ts
    │   └── <noun>-read-model.ts
    ├── persistence/        <verb>-<noun>.command-repository.ts, get-<noun>.query-repository.ts
    ├── infrastructure/     adapters of the context's ports (auths)
    ├── services/           login, session and request authentication (auths)
    ├── dtos/               request schemas derived from a command schema (auths)
    ├── jobs/               queue processors and dispatcher adapters (users)
    └── routes.ts           <noun>Routes(...): Route[]
```

The packages are organized by entry point instead: `packages/core/{domain,application,persistence,http}`
(see `packages/core/CLAUDE.md`).

## Naming patterns

| Kind | Class or symbol | File | Example |
| --- | --- | --- | --- |
| Aggregate | `<Noun>` extends `RootEntity<<Noun>Snapshot>` | `domain/models/<noun>.entity.ts` | `User`, `user.entity.ts` |
| Snapshot | `<Noun>Snapshot` | same file as the aggregate | `UserSnapshot` |
| Value object | `<Noun>` | `domain/models/<noun>.value.ts` | none yet; see SKILL.md D5 |
| Domain event | `<Noun><PastVerb>Event` | `domain/events/<noun>-<past-verb>.event.ts` | `UserCreatedEvent` |
| Business error | `<Name>Exception` | `domain/models/errors/<name>.exception.ts` | `UniqueEmailException` |
| Value error | `Invalid<Field>Exception` extends `InvalidValueException` | same folder | `InvalidUsernameException` |
| Command | `<Verb><Noun>Command` | `application/cqrs/commands/<verb>-<noun>.command.ts` | `CreateUserCommand` |
| Command handler | `<Verb><Noun>Handler` | `application/cqrs/commands/<verb>-<noun>.handler.ts` | `CreateUserHandler` |
| Query | `Get<Noun>Query` | `application/cqrs/queries/get-<noun>.query.ts` | `GetUserOverviewQuery` |
| Query handler | `Get<Noun>Handler` | `application/cqrs/queries/get-<noun>.handler.ts` | `GetUsersHandler` |
| Event handler | `<Noun><PastVerb>Handler` | `application/cqrs/events/<noun>-<past-verb>.handler.ts` | `UserCreatedHandler` |
| Read model | `<Noun>ReadModel` and `project<Noun>Read()` | `application/<noun>-read-model.ts` | `UserReadModel` |
| Command result | `<Noun>Result` (carries `aggregate`) | `application/results/<noun>.result.ts` | `AuthResult` |
| Port (behavior) | `I<Capability>` | `application/ports/<capability>.port.ts` | `IRefreshTokens` |
| Port (data) | `<Noun>` without `I` | same folder | `AuthTokenPolicy` |
| Write repository | `<Verb><Noun>CommandRepository` | `persistence/<verb>-<noun>.command-repository.ts` | `UpdateUserCommandRepository` |
| Read repository | `Get<Noun>QueryRepository` | `persistence/get-<noun>.query-repository.ts` | `GetUserQueryRepository` |
| Adapter | `<Technology><Port>` | `infrastructure/<technology>-<port>.<role>.ts` | `JoseAccessTokenIssuer` |
| Job processor | `<Verb><Noun>Processor` | `jobs/<verb>-<noun>.processor.ts` | `SendWelcomeEmailProcessor` |
| Routes | `<noun>Routes` | `<context>/routes.ts` | `userRoutes` |
| Constants | `UPPER_SNAKE` objects | `common/constants/<topic>.constants.ts` | `APP_ACTIONS`, `RATE_LIMIT_COST` |

A query class without a handler (`GetAuthByTokenHashQuery`, `GetUserCapabilitiesQuery`) is
the input of a query repository used inside another handler or service; it is never
dispatched on the bus.

## Building blocks

- **Shapes.** The aggregate, event, error, command, query, handler, read model and port
  shapes, with the file to copy for each, are in [style.md](style.md).
- **Base classes.** An aggregate extends `RootEntity<Snapshot>` from `@cqrs-ddd/core/domain`;
  a command extends `createCommand(schema, BaseCommand)` and a query
  `createQuery(schema, BaseQuery)` from `@cqrs-ddd/pipeline-zod`; a command handler extends
  `CommandBaseHandler<XCommand, Result>` and implements `handle`, never `execute`; a query
  handler implements `IQueryHandler` and an event handler `IEventHandler` from
  `@cqrs-ddd/cqrs`.
- **Query options.** A query is constructed as `new GetUserQuery({ userId }, { refresh: true })`,
  where the options are the `BaseQuery` options (`refresh`, `hydrate`), kept out of the
  payload.
- **Repository ports.** A create handler depends on `ICommandRepository<X, XSnapshot>`; a
  change or delete handler on `IWriteSideAggregateRepository<X>`, whose `findById` reads
  authoritative state; a query handler on `IQueryRepository<XQuery, Result>`.
- **Dependency names.** `commandRepository`, `queryRepository` (or a plural noun when a
  handler reads several: `users`, `roles`, `capabilities`), `authorizer`, `eventBus`.
- **Wiring.** Every handler is registered in `createApp()` of `api/src/app.ts` with
  `cqrs.register(new XHandler(...))`; every route list is added in `api/src/routes.ts`.
- **Shared schemas.** `api/src/common/validation/<name>.schema.ts` (`EmailSchema`,
  `IdempotencyKeySchema`).

## Error handling

- Errors are thrown exceptions; there is no Result type.
- Core provides `DomainException`, `InvalidValueException` (carries a `violation`),
  `EntityNotFoundException`, `ConcurrencyConflictError` and `MissingTenantContextError`
  from `@cqrs-ddd/core/domain`.
- Business errors are `…Exception`. Technical, configuration, concurrency and protocol
  failures are `…Error`, as in core: `TransientOperationError` extends `Error`, while
  `ConcurrencyConflictError` and `MissingTenantContextError` extend `DomainException` so
  that `domainErrorHttpStatus` can map them.
- A handler throws `EntityNotFoundException('<Aggregate>', id)` when a load returns `null`;
  a query handler returns `null` instead, and the route turns `null` into `HttpError(404)`.
- `api/src/http/answer.ts` maps errors to HTTP: `domainErrorHttpStatus` for core errors,
  each behavior's `/http` `toHttpResponse`, and `domainAnswer` in `api/src/domain-answer.ts`
  for the application's own exceptions. A new domain exception that needs a status other
  than the default is added there.
- Only routes throw `HttpError`; no package throws an HTTP error (`AGENTS.md` rule 4).

## Tests

- Vitest, with `describe`/`it` imported from `vitest`. Titles state behavior, invariant or
  contract; no ticket identifiers.
- A spec of one module sits next to it as `<file>.spec.ts`; a spec against SQLite is
  `<file>.sqlite.spec.ts`. Specs that span several modules live in `api/test/application/`;
  end-to-end suites are `api/test/e2e/**/*.e2e-spec.ts` (Docker, `pnpm test:e2e`); shared
  helpers live in `api/test/support/`.
- Domain specs exercise the aggregate directly (`User.create(...)`, then the method) and
  assert state, thrown exceptions and `getUncommittedEvents()`.
- Handler specs build fakes with `vi.fn()` cast to the port
  (`{ findById: vi.fn() } as unknown as IWriteSideAggregateRepository<User>`), call
  `uncommit()` on prepared aggregates, run `handler.execute(new XCommand(...))`, and assert
  orchestration: what was loaded, saved, returned or thrown.
- Packages and `integration/` keep 100% per-file coverage; `api` reports coverage without
  thresholds.
- Use `example.test` addresses and synthetic names in fixtures; never real data.

## Code style

- Every `.ts` file starts with `/* Copyright (C) 2026-present Aristotelis — see repository license. */`.
- Relative imports end in `.js` (`module: NodeNext`); type-only imports use `import type`
  or inline `type`.
- Biome formats with 2 spaces and single quotes (`pnpm format`).

## Existing deviations: do not copy

These spots break the conventions above. Leave them unless the task is to change them.

- `api/src/auths/services/principal-login.service.ts`: `refresh()` changes state outside the
  command bus, applies a rate limit inline, publishes events by hand, runs 100 lines and the
  class takes 12 dependencies.
- `api/src/auths/services/jwt-authenticator.ts`: `authenticate()` runs 124 lines.
- `api/src/auths/domain/errors/`: errors sit outside `domain/models/errors/`, and
  `AuthConfigurationException` names a configuration failure with the business suffix.
- `UpdateRoleCommand` calls `role.rename()`, which records `RoleUpdatedEvent`: three verbs
  for one action. `CreateAuthCommand` names the record, not the intent (a login).
- `api/src/users/application/cqrs/queries/get-user-overview.handler.ts` declares
  `UserOverviewDto`, which `api/src/users/routes.ts` imports from the handler file.
- `api/src/users/routes.ts`: `NewUser` restates the limits of `CreateUserCommand`; the HTTP
  field `name` carries the domain `username`.
- `api/src/users/application/cqrs/queries/get-user.handler.ts` and
  `api/src/roles/application/cqrs/queries/get-role.handler.ts`: build a conditional query
  inside the `find(...)` argument.
- `UniqueEmailException`, `EmptyUserUpdateException` and `UniqueRoleNameException` assign
  `this.name`, which `DomainException` already sets.
- `api/src/users/application/ports/user-event-dispatcher.port.ts` exports
  `IWelcomeEmailDispatcher` and `IUserBatchDispatcher`, whose methods repeat their receiver.
- The audit `metadata` lambda (`targetUserId`, `targetRoleId`) is repeated in four handlers.
- `GetUserPermissionRulesRepository` omits `Query` from its class name.
