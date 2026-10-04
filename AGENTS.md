# Repository Agent Instructions

These instructions apply to every agent/LLM making changes in this repository.

## What this repository is

The framework-neutral packages of the `@cqrs-ddd` organization: the DDD primitives
(`@cqrs-ddd/core`, `@cqrs-ddd/mikro-orm`), the dependency-free utilities
(`@cqrs-ddd/uuidv7`, `@cqrs-ddd/safe-stringify`, `@cqrs-ddd/untyped`) and the pipeline
behaviors (`@cqrs-ddd/pipeline`, `@cqrs-ddd/pipeline-<name>`), and the CQRS buses with
their handler decorators (`@cqrs-ddd/cqrs`). Every package runs without a framework or a
dependency-injection container. Applications on a framework, such as the NestJS `api` of
nestjs-pipeline, depend on these packages, never the other way round.

## The two repositories

Two sibling repositories form one product (owner, 2026-10-04). Read this before any
change that touches a package name, an export, a release or a decision the other
repository relies on.

| | ddd-cqrs | nestjs-pipeline |
| --- | --- | --- |
| Path | `~/Source/ddd-cqrs` | `~/Source/nestjs-pipeline` |
| GitHub | https://github.com/aristoteliss/ddd-cqrs | https://github.com/aristoteliss/nestjs-pipeline |
| Owns | The one implementation: the framework-neutral `@cqrs-ddd/*` packages and their NestJS adapter `@cqrs-ddd/nestjs`, published from 0.5.0; the example application `api/` on Express and Fastify; the documentation site https://aristoteliss.github.io/ddd-cqrs/; the local registry `tools/local-registry/` | The NestJS application `api/`, which from 0.5.0 installs the `@cqrs-ddd/*` packages; the old `@nestjs-pipeline/*` packages, stopped at 0.4.x and kept on npm with every version, and `@nestjs-pipeline/cqrs-ddd`, a facade that re-exports `@cqrs-ddd/nestjs` |
| Active task | `.claude/tasks/cqrs-ddd-pipeline.md` (the 0.5.0 release) | `.claude/tasks/adopt-cqrs-ddd-packages.md` (`api` on `@cqrs-ddd`, the README notices) |

How they connect:

- **Package code lives only in ddd-cqrs.** nestjs-pipeline installs the packages and never
  copies or patches their code; a missing feature or a bug found there is fixed in
  ddd-cqrs.
- **Dependencies point one way:** nestjs-pipeline depends on `@cqrs-ddd/*`; no
  `@cqrs-ddd` package imports `@nestjs-pipeline/*`, and only the adapter
  `@cqrs-ddd/nestjs` imports NestJS (ddd-cqrs `AGENTS.md`, rule 1).
- **Before anything is published,** nestjs-pipeline installs the packages from the local
  registry: Verdaccio in Docker, `~/Source/ddd-cqrs/tools/local-registry/`, on
  `http://127.0.0.1:4873/`, whose README holds every command. A fix in ddd-cqrs is
  republished there and tested again in nestjs-pipeline.
- **Package names.** `@nestjs-pipeline/core` continues as `@cqrs-ddd/pipeline` (the engine,
  `@UsePipeline`, `@SkipPipeline`) and `@cqrs-ddd/cqrs` (the buses);
  `@nestjs-pipeline/<name>` continues as `@cqrs-ddd/pipeline-<name>`. `@cqrs-ddd/core`,
  `mikro-orm`, `uuidv7`, `safe-stringify` and `untyped`, published from nestjs-pipeline up
  to 0.4.2, are published from ddd-cqrs from 0.5.0.
- **The old packages stay.** Versions 0.1 to 0.4 of `@nestjs-pipeline/*` are never
  unpublished or deprecated; a README notice, on GitHub and on npm through a README-only
  0.4.3, points to `@cqrs-ddd` 0.5.0.
- **Release order:** `@cqrs-ddd` 0.5.0 from ddd-cqrs first, so every link resolves; then
  nestjs-pipeline's changes; then the 0.4.3 notices. The owner publishes and pushes;
  agents commit only after asking, never on `master`.
- **Keep both sides current.** When work in one repository changes something the other
  relies on, update the other repository's active task file in the same session.

## Architecture-sensitive changes

Before changing persistence, caching, idempotency, authorization, tenant handling, domain
models, domain events or a pipeline behavior, read the nested `CLAUDE.md` of the package,
`.agents/skills/cqrs-ddd-architecture/SKILL.md` and these rules. They apply to changes involving:

- domain entities, domain events, or domain errors
- repositories, persistence, ORM/database access, caching
- authorization, tenant context
- idempotency, retries, rate limiting, auditing, metrics, tracing
- pipeline behaviors, their ordering and their keys

## Source of truth

The repository's current code and documentation are authoritative. Generic Clean
Architecture, DDD, CQRS or TypeScript guidance is secondary. If external advice conflicts
with an intentional repository decision, follow the repository and document any proposed
architectural change explicitly.

## Working discipline

These rules bias toward caution over speed. For trivial tasks, use judgment. Where they
touch library scope, "Library scope and review discipline" below governs.

### Think before coding

Don't assume. Don't hide confusion. Surface tradeoffs. Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them; don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop, name what is confusing, and ask.

### Simplicity first

Write the minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility or configurability that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask: would a senior engineer call this overcomplicated? If yes, simplify.

### Surgical changes

Touch only what you must. Clean up only your own mess. When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match the existing style, even if you would do it differently.
- If you notice unrelated dead code, mention it; don't delete it.

When your changes create orphans, remove the imports, variables, and functions that
*your* changes made unused. Don't remove pre-existing dead code unless asked.

Every changed line should trace directly to the request.

### Goal-driven execution

Define success criteria and loop until they are verified. Turn tasks into verifiable goals:

- "Add validation" → write tests for invalid inputs, then make them pass.
- "Fix the bug" → write a test that reproduces it, then make it pass.
- "Refactor X" → ensure tests pass before and after.

For multi-step tasks, state a brief plan with a check per step:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria allow independent iteration; weak ones ("make it work") need
constant clarification.

## Repository context files

`CLAUDE.md` (root) holds the durable working instructions for coding agents, and
`.claude/codebase-map.md` is the compact orientation map: repository shape, stack, entry
points, directory responsibilities, verified commands, critical modules and gotchas. A
package with local rules carries a nested `CLAUDE.md`.

The map is an index, not an authority: verify any claim against the source before relying
on it, and prefer the code when they disagree. Regenerate the generated sections with
`pnpm context:update`, update the human-owned sections by hand, and verify with
`pnpm context:validate`. Never place secret values in a context or task file.

## Library scope and review discipline

Every package here is a reusable library for external applications and future use cases.
Evaluate a feature against its contract, extension purpose, correctness, maintenance cost
and compatibility, not only local call sites. The absence of a call site in this
repository does not make an export, adapter or supported input type useless; conversely,
future reuse does not justify speculative abstractions.

Before removing an API, supported type, adapter or layer, establish its consumer scope,
actual cost or defect and compatibility impact, and distinguish a published API or
documented extension point, a reusable DDD primitive, an intentionally simulated
integration and truly redundant internal state. A local reference search cannot establish
that external consumers do not exist. An internal bug calls for a repair within the
abstraction, not deletion or relocation of the feature.

Label findings as a reproduced defect, a code-path inference, a contract risk or an
architectural proposal, and separate intended invariants from guarantees actually verified
by code and tests. Existing instructions express architecture intent; they are not proof
that an implementation is bug-free.

## Documentation and comment policy

Documentation describes the current repository contract: what exists, how to use it, what
callers can expect, and any current caveats. Do not document review history, refactor
history, removed behavior, or "before vs now" narratives.

- `AGENTS.md` contains generic repository and architecture instructions, not package
  tutorials or change history.
- Every published package must have consumer documentation covering purpose,
  installation/setup, public API, configuration, expected behavior, caveats, and practical
  examples, for plain Node.js use and, where it applies, for DDD/CQRS use. A package README
  stays short: what the package is, its installation and requirements, and links to its
  documentation.
- Documentation pages and READMEs are current-state manuals. Prefer "use X when..." and "X
  behaves..." over migration narratives such as "previously", "used to", "now", "after the
  fix", or descriptions of removed implementations.
- Every exported function, and every public method of an exported class, has a JSDoc block
  that is genuinely useful: what it does beyond what its name says, each parameter (units,
  accepted values, required context), the return value, errors and caveats, and an
  `@example` of a real call. A block that only restates the name or signature does not
  meet this rule; it is slop. Do not explain implementation mechanics. A method that
  implements a documented interface member is covered by that interface's doc.
- Exported types and interface members get a doc comment only for what the type cannot
  say: units, the meaning of an absent or empty value, a security or ordering constraint.
- Command and query classes, handlers and ordinary domain entities carry no inline
  comments and no narrative JSDoc. When their flow is hard to follow, rename, extract or
  simplify instead of commenting, and state invariants in test names.
- Inline comments belong only inside difficult, exceptional core mechanisms (pipeline
  internals, persistence lifecycle, cache coordination, concurrency or protocol handling),
  where they help a reader follow the internal flow or state a non-obvious concurrency,
  security or protocol constraint. Keep them short and factual. Concise step markers in
  multi-phase core algorithms (e.g. `// 1. Validate ordering constraints`) are welcome.
  Paragraph-sized comments or tutorial explanations belong in the documentation or an
  exported function's JSDoc.
- **No AI slop or decorative banners in code**: never write decorative divider lines, ASCII
  banners, or box borders (e.g. `// ── ... ──`, `// ===== ... =====`).
- **No ticket, review, or task identifiers in code or test titles**: never embed task IDs,
  issue numbers, or review finding tags in code comments, test file names, `describe`/`it`
  strings, function names, or variable names. Tests describe the *actual behavior,
  invariant, or contract*. Task IDs belong exclusively in task-tracking documents (such as
  `.claude/tasks/`).
- **No verbose narrative signposting**: avoid conversational self-referential commentary
  ("This block validates...", "Here we handle...", "Helper method to...").
- Comments must never describe a past code state or justify a completed change. Git
  history owns history.
- License headers, deprecation notices, generated-code markers, lint suppressions with a
  real reason, and externally required protocol notes are exempt from the brevity rule.

## Naming

Good names are short and declarative. A long name is a code smell: it usually repeats its
context, or the thing it names does too much.

- Use the shortest name that is unambiguous in its scope. The enclosing module, class,
  type or function is part of the name: `sessionService.save(...)`, not `saveSession`;
  `auth.expiresAt`, not `auth.sessionExpiresAt`. Qualify only when two values in one scope
  would otherwise collide.
- No prefix or suffix the declaration or its context already states: no type or layer
  words (`userObj`, `dataList`, `…Impl`, `…Manager`, `…Helper`, `…Util`), no history or
  status words (`legacy`, `old`, `new`, `v2`, `temp`). The architectural role suffixes
  (`…Command`, `…Handler`, `…Query`, `…Event`, `…Behavior`, `…Repository`,
  `…Exception`/`…Error`) and the `I` prefix of ports stay, because they name the role.
- A name states what the thing is or does, and stays true to its behavior.
- Booleans read as yes/no statements (`isExpired`, `hasPipeline`, `includeStack`), never as
  a bare noun phrase and never negated (`notEnabled`).
- Functions and methods are verbs (`revoke`, `issue`, `hash`); values and types are nouns;
  converters are `to…`/`from…`.
- One concept, one name, in every layer and in every flavor of a package; one name never
  means two things.
- A unit is the one suffix that earns its length: a duration held in a bare `number` names
  its unit (`ttlMs`, `graceSeconds`); a number named `…At` is Unix milliseconds unless the
  name says otherwise.
- Abbreviate only what every reader knows (`id`, `ip`, `url`, `jwt`, `ttl`, `dto`) or the
  repository already uses (`em`, `ctx`).
- Do not lengthen a name to carry what its JSDoc should say. Renaming a published export
  is a breaking change.
- Files are kebab-case with their role suffix (`cache.behavior.ts`,
  `user-created.event.ts`, `memory.store.ts`).

## Non-negotiable repository rules

1. **Framework independence.** No package imports NestJS, another `nestjs`-named package
   or an `@nestjs-pipeline/*` package, in code or specs, and no manifest declares one
   (`framework-independence.grit`, the release check). A framework integrates through the
   ports these packages define, from its own adapter packages.
   **Stay as clean as possible** (owner, 2026-10-03): an application on another framework,
   or on none, uses these packages without bringing in half of NestJS; NestJS usage
   lives in the nestjs-pipeline repository. Do not reproduce a framework's architecture
   here: no containers, module systems, controllers, guards, interceptors or lifecycle
   machinery added for parity. One exception (owner, 2026-10-04): `packages/nestjs`
   (`@cqrs-ddd/nestjs`) is the NestJS adapter of these packages. NestJS is only its peer,
   no other package imports or names it, and `framework-independence.grit` and the release
   check leave only that package out. Borrowing one or two framework concepts is fair only as a
   small helper, a function or decorator of a few lines, when it saves three to five times
   its size in the code that uses it. Packages hold what has to do with CQRS, DDD and their
   decorators (handler, pipeline, domain and repository decorators). The end goal is a
   real-life example API (`api/`) that uses these packages; a new package is welcome when
   it serves that goal and is not a copy of an existing framework such as NestJS.
2. **Pipeline and DDD independence.** A pipeline package (`@cqrs-ddd/pipeline`,
   `@cqrs-ddd/pipeline-*`) does not import or declare `@cqrs-ddd/core` or
   `@cqrs-ddd/mikro-orm`, and those two do not import or declare a pipeline package
   (`pipeline-independence.grit`, `ddd-independence.grit`, the release check). A request
   tells a pipeline its kind through the `Symbol.for('@cqrs-ddd/request-kind')` brand.
3. **No environment.** Packages read no environment (`core-environment.grit`); they take
   configuration through options and constructor arguments that the application fills from
   its own configuration module.
4. **Framework-neutral errors.** Errors extend `Error` and carry no transport semantics. A
   package that helps with HTTP exports the mapping of its errors to statuses from an
   `http` entry point, as `domainErrorHttpStatus` does in `@cqrs-ddd/core/http`; no package
   throws an HTTP error.
5. **Short-circuit keys are a security boundary.** Cache and idempotency short-circuit
   keys must include tenant, principal, and permission scope whenever those dimensions can
   change the final authorized response. Fail closed when required security context is
   absent; never silently fall back to shared `'default'` namespaces. A pipeline hit skips
   the handler's entity and field checks, and an outer type-level authorization check does
   not reproduce them; entity-level authorization and field filtering run in the
   application path after the real aggregate or result is available. Correlation IDs are
   tracing metadata, not principal or permission boundaries. An idempotency key is an
   operation identity, not a disposable response-cache key: rotating it on permission
   changes can let the same effect run again. An idempotent operation may therefore keep a
   stable key only when replay carries an equivalent fail-closed scope check — a stored
   authorization digest compared before any completed response is returned, refusing a
   mismatch and refusing a record that has none. Scope equality is valid only for the
   decisions the captured context represents; an operation whose authorization depends on
   resource state that changes later needs an explicit replay-authorization hook or must
   not replay results at all.
6. **Tenant.** Code that needs the current tenant calls `requireTenant(purpose)` from
   `@cqrs-ddd/core/application`, which reads the resolver the application registers with
   `setTenantResolver` and fails closed with `MissingTenantContextError`. Never substitute a
   default tenant.
7. **Aggregate mutation.** Mutate aggregates through factories and domain methods, not
   direct setters or synthetic snapshots constructed only to trigger persistence.
   Aggregates inherit from the framework-neutral `AggregateRoot` of `@cqrs-ddd/core/domain`.
   Aggregate setters are `private` and exist only for ORM hydration.
   `aggregate-identity.grit` flags syntactic property writes on receivers named `user`,
   `role`, `aggregate`, or `entity` in application layers; it cannot resolve types,
   aliases, or dynamic keys, so domain-method mutation remains mandatory outside its
   coverage.
8. **Event publication.** `CommandBaseHandler` publishes an aggregate's buffered events
   after the handler returns; do not publish them a second time. An in-process event
   publisher is not a transactional outbox; durable delivery requires an explicit
   architecture decision.
9. **Persistence lifecycle decorators.** Persistence write operations (`save()`) use
   declarative lifecycle decorators: `@PersistedWrite(...)` when the aggregate is the first
   argument and the write acknowledges, otherwise the individual decorators in canonical
   outermost-to-innermost order: `@Cache(...)` -> `@AcknowledgePersisted(...)` ->
   `@MapPersistenceErrors(...)`. Never combine the two forms on one method.
10. **Acknowledgment.** `acknowledgePersisted()` happens only after durable persistence
    succeeds (handled by `@AcknowledgePersisted`); never advance the persisted version
    baseline on failed writes or uncommitted transactions.
11. **Version-conditioned writes.** Entity updates use version-conditioned writes
    (`optimisticUpdate()`) requiring autocommit (`em.isInTransaction()` rejects outer
    transactions) and matching `WHERE id = ? AND version = expectedVersion`. Entity
    deletions condition on `{ id, version: aggregate.getExpectedVersion() }` and inspect
    affected rows to distinguish missing entities (`EntityNotFoundException`) from
    concurrency conflicts (`ConcurrencyConflictError`). Persistence adapters translate
    ORM/driver version-conflict signals at this boundary; application and domain code never
    depend on ORM error classes. `domainErrorHttpStatus` maps `ConcurrencyConflictError` to
    HTTP 409. Unique-constraint and other database errors retain their own mappings.
12. **Snapshots in caches.** Repository cache adapters (`ICache<TSnapshot>`) store strictly
    serializable snapshots, never live domain aggregates. `MemoryCache` enforces deep
    detachment parity with external caches through JSON cloning on `set()` and `get()`.
    Query repositories return domain aggregates (`Promise<TEntity | null>`), never a union
    with snapshot types: declare the hydrator once as the repository's `QueryRepository`
    hydration policy, or per method with `@FromCache({ alwaysHydrate: true, hydrateFn })`,
    which is validated at decoration time.
13. **Two cache layers.** Repository caching (`@FromCache`, persistence `@Cache`, `ICache`)
    and pipeline caching (`CacheBehavior`) are complementary layers and both are retained:
    the persistence adapter owns snapshots and repository reads because it knows the
    affected lookup keys and write lifecycle; the use case owns composed results because it
    knows their dependencies, security scope and freshness. Entity invalidation does not
    invalidate a composed pipeline result; when both layers serve one flow, define their
    keys, expiry and dependencies separately.
14. **Cache coordination.** Protect newer state from stale fills and writes: `@Cache`
    write-through uses CAS version comparison (`isCacheNewer`), `@FromCache` returns the
    newer cached snapshot when a mutation races a database read, and `MikroOrmCache`
    bypasses the identity map and deletes expired entries conditionally. Verify these
    mechanisms rather than assume them: their presence does not prove safety across the
    final-check/write gap, expiry/absence ABA, delete/recreate, secondary lookups or retry
    exhaustion. A database commit and a cache mutation are not one transaction; document
    stale-read and failed-invalidation behavior instead of promising exactly-once or strong
    consistency.
15. **Authoritative write-side loading.** Write-side repositories expose authoritative
    aggregate loading through `IWriteSideAggregateRepository<TEntity, TId = string>`,
    returning rehydrated domain aggregates from primary persistence (`{ refresh: true }`).
    Anti-resurrection uses mutation barriers: `@Cache` installs a `CacheMutationBarrier`
    token on deletions and secondary key invalidations, and `@FromCache` fills only through
    a revision-fenced `IVersionedCache` (`tryFill` commits only if nothing advanced the
    key's revision during the database read, with bounded retries); an adapter exposing only
    `get`/`set` is bypassed for both reads and fills. Race defects are repaired and
    regression-tested within the abstraction.
16. **Freshness.** Authoritative write-side loading is a freshness policy for mutations, not
    a ban on cached reads inside commands. A cached read is allowed where the use case
    explicitly tolerates that freshness; it never replaces an authoritative precondition or
    authorization check.
17. **No production code for tests.** No export, parameter, option, branch, or piece of
    retained state may be added or widened because a test needs to reach it. Test the
    behavior through the surface real callers use; where a module boundary must be crossed,
    mock the module in the test (`vi.mock`) rather than threading a seam through the
    signature.
18. **No slop.** Production and test code stay free of AI slop, decorative ASCII banners,
    step-by-step narration, and task or ticket references. Exported functions and the public
    methods of exported classes carry useful JSDoc with an `@example`; inline comments appear
    only inside difficult core mechanisms. Tests describe behaviors and contracts.
19. **Names.** Names are short and declarative, with no prefix or suffix their context
    already gives. Follow the Naming section above.
20. **Guards.** The rules a linter can check are Biome Grit plugins in `biome/plugins/`,
    with specs in `integration/checks/lint/`; verify with `pnpm lint:plugins` and `pnpm check`. Do
    not loosen a plugin to make a change pass.

## Before finishing

- Run the narrowest relevant typecheck and tests, then the affected packages' tests and
  `pnpm lint:plugins`.
- Every package keeps its 100% per-file coverage thresholds; close a gap with a behavior
  test, not an ignore directive.
- Update the documentation when a deliberate repository decision changes.
