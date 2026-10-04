---
name: cqrs-ddd-architecture
description: Guide changes to the framework-neutral @cqrs-ddd packages — domain models, persistence lifecycle, repository and pipeline caching, short-circuit keys — preserving their contracts and race protections.
---

# cqrs-ddd Architecture Skill

Use this skill for any change to domain models, repositories, the persistence lifecycle
decorators, caching, idempotency keys or pipeline behaviors in this repository. `AGENTS.md`
holds the non-negotiable rules; this skill holds the reasoning and the detailed contracts.

## The sibling repository

The packages here are the one implementation; nestjs-pipeline (`~/Source/nestjs-pipeline`)
is a NestJS application that installs them from 0.5.0 and must not need its own copy of any
contract described in this skill. A contract change here is a change for that application
too: record it in its active task file. The connection and its rules are in `AGENTS.md`,
The two repositories.

## Library scope and caching decisions

`packages/*` target external consumers and future applications. Local non-use does not prove a public export, adapter or supported
payload type is unnecessary. Removing a supported contract requires
consumer/compatibility reasoning beyond an example search.

Repository caching and pipeline caching are separate layers with separate owners;
keep both. Cache a repository-owned read in the repository and a composed
application result at the pipeline boundary. Do not move application composition
into a repository merely to cache it, and do not require an application query
class for every repository lookup. Invalidation is per layer: entity invalidation
does not invalidate a composed pipeline result.

Commands read through repository/application ports, never ORM clients and never
query-bus dispatch merely to obtain data. Mutations keep the authoritative
write-side loading contract; a freshness-tolerant cached read elsewhere in a
command is allowed only when the use case states that tolerance, and never in
place of an authoritative precondition or authorization check.

Repository invalidation belongs near successful persistence, which knows the
changed entity and its old/new lookup values, including secondary keys. Cached
collections and pipeline results need their own dependency or TTL policy. Do not
promise automatic cross-layer or cross-service invalidation.

Separate reproduced defects from architectural proposals, and intended invariants
from verified guarantees. Repair cache races within the intended abstraction; do
not infer that a cache layer must be removed.

## Keep domain invariants and mutations inside aggregates

Use aggregate factories and domain methods for state changes.

Canonical examples:

- `User.create(...)`
- `user.update(...)`
- `user.delete()`
- `Role.create(...)`
- `role.rename(...)`
- `role.delete()`

Aggregate setters (`id`, `createdAt`, `updatedAt`, `version`, `username`, `department`, `name`) are `private` and exist only for MikroORM `accessor: true` hydration; do not add a public setter. `biome/plugins/aggregate-identity.grit` checks known hydration properties on receivers named `user`, `role`, `aggregate`, or `entity` in application layers, including literal bracket writes, compound assignments and updates. It is a syntax-only naming convention: types, aliases, dynamic keys, destructuring and reflection are outside its coverage. Domain-method mutation remains mandatory regardless of lint coverage.

Do not instantiate aggregates in application code with `new Aggregate(snapshot)` merely to trigger a repository operation. Prefer a real domain operation or an explicit application port whose name expresses the intent.

## Use `CommandBaseHandler` for command lifecycle and aggregate events

For aggregate-changing commands, prefer the repository's `CommandBaseHandler` pattern.

Handlers must return the aggregate root (or an application result containing `aggregate: AggregateRoot`) so `CommandBaseHandler.execute()` publishes buffered aggregate events automatically and clears uncommitted events.

Never publish or commit domain events manually inside command handlers. Presentation-specific transformations belong in the application's presentation layer, and a command payload never carries an HTTP object.

## Treat cache and idempotency short-circuiting as a security boundary

Pipeline cache/idempotency can return a result without executing the handler.

If the handler performs entity-level authorization or field filtering, a short-circuit key must include every security dimension that can change the result, including as applicable:

- tenant
- principal/user
- permission/capability scope or version
- request identity/payload

Never use a tenant-only cache key for a principal-specific or permission-filtered response.

The generic default cache key is safe only for results that are not principal/permission-specific. Use an explicit key for protected responses.

For multi-tenant security-sensitive keys, fail closed when tenant identity is required. Do not silently collapse missing tenant context into a shared `'default'` namespace unless the flow is explicitly single-tenant/dev-only. Throw `MissingTenantContextError` rather than substituting fallback defaults.

When authorization/roles can vary while the principal ID remains stable, either incorporate an authorization version/fingerprint in the key or invalidate all affected principal-scoped entries when roles change.

An outer type-level CASL check does not reproduce the handler's entity decision. Correlation IDs are tracing metadata a caller can supply or reuse, never a principal or permission boundary.

Repository caches of authorization-independent data are tenant-scoped and return detached domain data; entity/field authorization still runs in the application. Scope a repository key to the principal when the result itself depends on it.

An idempotency key is an operation identity, not a disposable response-cache key: rotating it on permission changes can let the same effect run again. Evaluate replay scope and operation deduplication together.

## Query rules

Queries should be side-effect free from the business perspective.

Query repositories and decorators:

- `QueryRepository<TQuery, TResult>` accepts exactly 2 generic parameters: the query input type and the domain aggregate output type.
- `@FromCache<TQuery, TResult>` accepts 2 generic parameters. On cache miss, it extracts a detached snapshot (`toCacheSnapshot()`, `serializeFn`, or `result.toJSON()`).
- Query repositories return strictly `Promise<TEntity | null>`, eliminating ambiguous union types (`User | UserSnapshot`). Declare rehydration once through the `QueryRepository` constructor's hydration policy (`super(cache, { hydrateFn })`, every hit rehydrated), or per method with `@FromCache({ alwaysHydrate: true, hydrateFn, ... })`; decoration-time validation ensures `alwaysHydrate: true` requires `hydrateFn`. A method's own `hydrateFn` (or `null`) and `serializeFn` override the repository default.
- Concurrent reads: when an in-flight query races a concurrent write that updates the cache, `@FromCache` detects the newer cached version (`newerCheck(current, snapshot)`) and returns the hydrated newer version rather than stale database data. A stale fill must never replace newer cache state; separate read/check/write steps do not prove that guarantee, so verify the coordination through the final write.
- Anti-resurrection: `@Cache` writes a `CacheMutationBarrier` sentinel on deletions and secondary key invalidations, and `@FromCache` fills only through a revision-fenced `IVersionedCache`: it observes the key's revision before the database read and commits with `tryFill` only if nothing advanced it, so a stale snapshot cannot overwrite a barrier; a rejected fill re-reads and boundedly retries. An adapter with only `get`/`set` cannot be fenced, so `@FromCache` bypasses it for both reads and fills. Test invalidation after the last read but before fill, absence/expiry ABA, delete/recreate and retry exhaustion; the presence of barriers is not proof that all races are prevented, and DB commit plus cache maintenance remains a separate consistency boundary.
- Cache adapters (`ICache<TSnapshot>`) store strictly serializable snapshots, never live domain aggregates. `MemoryCache` enforces deep detachment parity with database caches via JSON cloning on `set()` and `get()`.
- `MikroOrmCache` (`packages/ddd-core`) executes queries outside the identity map (`{ disableIdentityMap: true }`) and never deletes an expired row: it reports it as `expired` and keeps its revision, so an expired reader cannot purge a concurrent fresh write.

Query handlers:

- depend on `IQueryRepository<TQuery, TEntity | null>`
- perform authorization/filtering after loading (for example with `CaslAuthorizer` of `@cqrs-ddd/pipeline-casl`)
- return secure snapshots/read models to presentation (e.g. `UserSnapshot | null`)
- must not mutate aggregates or persist writes

Repository-level read-through cache (`@FromCache`) is a good fit for authorization-independent aggregate data. Pipeline cache is appropriate only when its key safely partitions all dimensions of the final response.

## Command rules

Command handlers should express the use case in a small sequence:

1. load required aggregate(s) through `IWriteSideAggregateRepository<TEntity, TId = string>` (which returns `Promise<TEntity | null>` directly, using `{ refresh: true }` and `mapPersistenceError`);
2. fail with framework-neutral application/domain errors if preconditions are not met;
3. authorize against the real aggregate if required;
4. call aggregate domain methods;
5. persist through `ICommandRepository`;
6. return aggregate or explicit result;
7. let `CommandBaseHandler` manage aggregate event publication.

Cross-cutting concerns belong in `@UsePipeline(...)` declarations or module-wide behavior configuration.

## Repository implementation rules

Concrete repositories may use ORM/database APIs and cache implementations.

Repositories are responsible for persistence mechanics such as:

- persistence mapping/rehydration
- optimistic locking
- cache invalidation/read-through caching
- tenant-specific DB access
- translating low-level persistence errors into framework-neutral errors when required by the application contract

Do not throw HTTP exceptions from repositories.

### Persistence lifecycle decorators

On command repository `save()` operations whose first argument is the aggregate and which acknowledge the persisted version (creates and updates), use `@PersistedWrite({ cache, unique, otherwise })`. It applies the three decorators below in canonical order with the first argument as the entity. Keep the individual decorators for other signatures, for deletes (which do not acknowledge), and for caller-owned ordering; never combine the two forms on one method. The individual decorators, outermost-to-innermost:

1. `@Cache(...)`: Write-through cache synchronization/invalidation after durable write and acknowledgment, using detached snapshots from `toCacheSnapshot()`. CAS comparison (`isCacheNewer`) keeps late-finishing writes from overwriting newer cached versions, and entity deletions (`deleteKeys`) and secondary invalidations (`invalidateKeys`) install a `CacheMutationBarrier` sentinel (`{ ttl: 0, reason: 'deleted' | 'invalidated', token: uuidv7() }`) against stale snapshot resurrection. Verify the atomic coordination of these mechanisms with readers; a barrier installation alone does not prove anti-resurrection or cross-store strong consistency.
2. `@AcknowledgePersisted({ entity: ([arg]) => arg })`: Captures entry version, updates `aggregate.acknowledgePersisted(version)` only after the persistence promise resolves.
3. `@MapPersistenceErrors({ entity, unique: { property: ... } })`: Translates unique violations into domain exceptions, keyed by entity property; the registered persistence dialect (`MikroOrmDialect`) reads which constraint the driver error names. Repositories never write constraint names or columns.

### Optimistic updates and conditional deletes

Persistence adapters may observe ORM/driver-specific conflict signals. Repository helpers surface version conflicts as framework-neutral `ConcurrencyConflictError`, keeping application/domain code independent of MikroORM error classes. Presentation maps this error to HTTP 409. Missing rows remain `EntityNotFoundException`; unique-constraint and other database errors retain their separate mappings.

- **Updates**: Use `optimisticUpdate(em, entityType, aggregate, data, entityName)` for update repositories.
  - Updates are conditioned on `WHERE id = ? AND version = aggregate.getExpectedVersion()`, updating `version` to `aggregate.version`.
  - Rejects outer transactions (`em.isInTransaction()`) because external transactions require commit-time acknowledgment and cache eviction.
  - On 0 affected rows, runs a refreshed diagnostic read: raises `EntityNotFoundException` if entity is gone, or `ConcurrencyConflictError` if version mismatch.
- **Deletes**: Execute conditional `nativeDelete(entityType, { id: aggregate.id, version: aggregate.getExpectedVersion() })`.
  - On 0 affected rows, perform a refreshed existence check to raise `EntityNotFoundException` or `ConcurrencyConflictError`.
- **Lint Enforcement**: Persistence structure and conventional aggregate property writes are checked by Biome Grit plugins (`biome/plugins/persistence-lifecycle.grit`, `aggregate-identity.grit`). Run `pnpm lint:persistence` and `pnpm check` to verify.

## Domain model rules

Domain models must remain free from:

- HTTP or framework presentation exceptions
- ORM decorators or DB-specific types unless the repository explicitly standardizes otherwise
- queue/broker APIs
- environment variables
- logging/telemetry

Use `DomainException` subclasses for invariants/business errors. Declare a field's value constraints once with `textRule`/`numberRule` (`@cqrs-ddd/core/domain`) in the aggregate's static `rules`, parse through them in the constructor and the `@Mutable` normalizer, and read their limits in request schemas; a value exception extends `InvalidValueException`.

Creation factories should record creation events. Rehydration methods must not record creation events.

Application code should not bypass factories/domain methods by using public constructors directly.

## No production code for tests

Tests observe the system; they do not get their own API.

Never add or widen any of these because a test needs it:

- an `export` on a function, constant, or type that no non-test module imports;
- a parameter whose only non-default argument comes from a spec (for example an
  injectable module/dependency override);
- an option, flag, or branch that only a test sets;
- process-global or static state that only a test reads.

Each of these makes the signature or lifetime of production code answer to the
test rather than to the problem, and it hides how much of the real path is
actually covered: a unit test calling an exported internal proves the internal
works, not that anything calls it correctly.

Instead:

- test through the surface real callers use — the wrapped function, the behavior,
  the repository;
- to control a dependency at a module boundary, mock the module in the spec
  (`vi.mock('<module>', ...)`), which needs no production seam;
- if the behavior genuinely cannot be reached from any real caller, that is dead
  code: delete it rather than testing it.

A helper extracted for readability and used by production code is fine; what is
forbidden is surface that exists solely so a test can reach inside.
