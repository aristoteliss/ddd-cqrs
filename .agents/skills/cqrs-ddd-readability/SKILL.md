---
name: cqrs-ddd-readability
description: Write and review readable TypeScript in this repository, following the conventions the code already uses. Covers the domain, command, query, handler, event and route code of the bounded contexts (api/src/<context>/ and the integration/ applications), and the measurable general and library limits (function length, nesting, parameters, conditions, numbers, errors, abstractions) for packages/* and every other workspace. Use when adding a command or query, changing a handler, an aggregate, a domain event or a route, writing or refactoring library code, or reviewing a diff or a file for readability, complexity or over-engineering. For persistence lifecycle, caching, idempotency keys, tenant handling or pipeline internals, use cqrs-ddd-architecture instead.
model: sonnet
---

# cqrs-ddd Readability Skill

This skill governs how DDD/CQRS code in this repository reads. `AGENTS.md` holds the
non-negotiable rules and wins over this skill; `.agents/skills/cqrs-ddd-architecture/SKILL.md`
governs persistence, caching and security boundaries. Repository conventions take
precedence over textbook DDD or CQRS advice.

- [references/conventions.md](references/conventions.md): folder layout, naming patterns,
  error style and test conventions, exactly as the code uses them.
- [references/style.md](references/style.md): the shape of each building block as the
  code writes it, and the cleanest file to copy for each kind.
- [references/examples.md](references/examples.md): before/after examples drawn from
  patterns in this repository.

## Where the rules apply

- The domain and CQRS rules apply to `api/src/<context>/` (`users`, `roles`, `auths`) and to
  the `integration/` applications. The general readability rules apply to the TypeScript
  source of every workspace. The library rules apply to `packages/*`.
- The test conventions in `references/conventions.md` govern specs; the length and nesting
  limits do not.
- They apply to new and changed code. Do not refactor untouched code to meet them
  (`AGENTS.md`, Surgical changes); mention a violation you notice instead.

## Core principles

1. **The code says what the business does.** A reader learns the use case from names, not
   from comments.
2. **Behavior lives with the state it protects.** An invariant enforced inside one
   aggregate method cannot be bypassed by a second caller.
3. **Handlers orchestrate; they do not decide.** A handler that only loads, authorizes,
   calls one domain method and saves can be read at a glance.
4. **One rule, one place.** A limit or invariant stated twice drifts apart.
5. **Follow the existing pattern before inventing one.** A reader who knows one bounded
   context can then read all of them.
6. **The smallest readable solution wins.** Every abstraction is a cost the next reader
   pays.
7. **Rules are checked, not assumed.** Run the real commands; review checks what no tool
   checks.
8. **Refuse, decide, then act.** A call checks its input first, works out what should
   happen second, and writes last. The handler shape (C5) is this order applied to a use
   case; every function follows it.
9. **Failures stay visible.** A failure is thrown with a message that names its subject,
   or reported to the logger the caller supplied. It is never swallowed silently.

## Domain rules

- **D1. Ubiquitous language.** Names come from the words the context's route summaries and
  test titles use for the concept (user, role, session, refresh, revoke). Domain code uses
  no technical filler words (`data`, `info`, `manager`, `process`).
- **D2. Mutation through behavior.** State changes go through a factory (`static create`)
  or an aggregate method decorated with `@ApplyMutation`. Setters are `private` and exist
  only for ORM hydration. Application code never calls `fromJSON` or a constructor to
  build a changed aggregate (`AGENTS.md` rule 7).
- **D3. Intention-revealing methods.** A new behavior gets a method named for the business
  verb (`role.rename(name)`, `auth.revoke(now)`), not a new generic `update(fields)`. The
  existing `User.update(fields)` stays for the PATCH use case it serves. When one verb can
  end in several outcomes, the public method decides and leaves each state change to a
  `protected` `@ApplyMutation` method named `apply<Noun>`, as `Auth.refresh` and
  `Auth.revoke` do.
- **D4. The aggregate owns its invariants.** A field constraint is a `textRule` or
  `numberRule` in the aggregate's static `rules`, parsed in the constructor and in the
  `@Mutable` normalizer. The aggregate enforces it even when a request schema checks it
  first.
- **D5. Value objects only where a value rule is not enough.** A primitive with a value
  rule is the default. A value object is justified only for a concept whose fields travel
  together (an amount with its currency) or that has behavior of its own (comparing,
  adding). It is immutable, has a private constructor and a static factory that validates
  through value rules, and lives in `<context>/domain/models/<name>.value.ts`.
- **D6. Domain events.** An event is `<Noun><PastVerb>Event extends RootDomainEvent<Aggregate>`
  in `<context>/domain/events/<noun>-<past-verb>.event.ts`. Its past verb matches the
  method that records it (`rename` records `RoleRenamedEvent`). It is recorded only
  through `@ApplyMutation({ event })`, or `apply()` inside a factory. Its payload is the
  aggregate snapshot `RootDomainEvent` defines, and each event handler destructures only
  the fields it uses. The only other payload shape allowed is a narrower one that keeps
  secret material out of the event, declared in the event's type and stated in one JSDoc
  line, as the `Auth` events do.
- **D7. Errors.** A business-rule violation is `<Name>Exception extends DomainException`,
  and a value violation extends `InvalidValueException`. Both live in
  `<context>/domain/models/errors/`. A technical, configuration, concurrency or protocol
  failure is `<Name>Error`: it extends `Error`, or `DomainException` only when it must map
  to an HTTP status through `domainAnswer`, as core's `ConcurrencyConflictError` does.
  Only routes throw `HttpError`.
- **D8. Pure domain.** Domain source files import only `@cqrs-ddd/core/domain` and files
  under their own context's `domain/`: no framework, ORM, Zod, pipeline, persistence or
  other-context import.

## CQRS rules

- **C1. Command names.** `<Verb><Noun>Command` in `<verb>-<noun>.command.ts`, built with
  `createCommand(z.object({ ... }), BaseCommand)`. Plain creation and deletion keep
  `Create` and `Delete`; any other change names its intent (`RenameRole`, `RevokeAuth`).
  The handler calls the aggregate method of the same verb.
- **C2. Query names.** `Get<WhatItReturns>Query` (`GetUserOverview`,
  `GetUserPermissionRules`), built with `createQuery(z.object({ ... }), BaseQuery)`. A
  query handler returns a read model or plain data, never an aggregate.
- **C3. Command results.** A command handler returns the aggregate, or a result carrying
  `aggregate` (`AuthResult`), so that `CommandBaseHandler` publishes its events. A route
  takes what it needs from the result (usually `id`) and answers through a query. No code,
  services included, publishes or `uncommit()`s aggregate events by hand.
- **C4. Queries never write.** A query handler changes no state, depends on no command
  repository, and authorizes after loading (`authorize`, `can`, `project`).
- **C5. Thin handlers.** `handle()` (commands) or `execute()` (queries) reads top to bottom
  as: load → not found (`EntityNotFoundException`) → authorize against the real aggregate
  → one domain method call → save → return. Each step is its own block, separated by one
  blank line: the destructured command, load with its not-found guard, authorize, the
  domain call, save, and `return`. A branch that decides a business outcome
  belongs in the aggregate.
- **C6. Cross-cutting concerns in the pipeline.** Type-level authorization, rate limits,
  idempotency, audit, retries, caching, feature flags, dead letters and metrics are
  `@UsePipeline(...)` entries, never inline code in a handler or service.
- **C7. Rule of three for pipeline options.** A pipeline option written the same way in a
  third handler moves to a named factory in `api/src/common/<behavior>/`, as
  `claimedIdentityActor` in `api/src/common/audit/audit.options.ts` does.
- **C8. Location.** A command and its handler sit side by side in
  `<context>/application/cqrs/commands/`; queries in `queries/`; event handlers in
  `events/`. Read models live in `<context>/application/<name>-read-model.ts`, never in a
  handler file. Ports live in `<context>/application/ports/<capability>.port.ts`, and the
  file is named after the port it exports.
- **C9. Read side.** A query repository that reads an aggregate returns the aggregate
  (`AGENTS.md` rule 12). One that reads data no aggregate owns (permission assignments,
  permission rules) returns a plain type shaped for its handler. The handler projects
  either into the read model. The read side calls no aggregate method that changes state.
- **C10. Validation has one owner per rule.** The command's Zod schema checks input shape
  and reads its limits from `Aggregate.rules`. A route schema derives from the command
  schema (`UpdateUserCommand.schema.shape`) instead of restating limits. Business
  invariants live in the aggregate. No rule gets a fourth copy.
- **C11. Bounded contexts.** A context may read another through its query class,
  query-repository port, read model or domain types. It never imports another context's
  command, handler or command repository, and never calls a method that changes another
  context's aggregate. If a use case needs that, stop and ask the owner.
- **C12. Routes.** `<context>/routes.ts` exports `<noun>Routes(...)` (`userRoutes`), which
  returns `Route[]`. Each route builds one command or query, dispatches it on its bus and maps the
  result to the HTTP body. A route holds no domain rule, no repository call and no
  service call that changes state: a new state change is a command.

## General readability rules

- **G1. Length.** A `handle()` or `execute()` body is at most 30 lines; any other function
  or method body is at most 40 lines. Decorators and the signature do not count. Split a
  longer body by step (refuse, load, decide, act) only where each extracted part has a
  meaning of its own and a name that says it, so the caller still reads top to bottom. A
  function whose steps only make sense together (a protocol, a parser, an ordered cache or
  concurrency sequence) may stay longer, as one function with its steps separated by
  blank lines (G15); the review states why. Never split only to meet the number: a reader
  who jumps between helpers to follow one idea reads worse.
- **G2. Nesting.** Prefer an early exit to nested logic. One level of nesting is normal
  where it helps readability; at most 2 levels of nested blocks inside a function body.
  A third level is an exception, stated in the review: a core library path where it buys
  a real performance gain (a measurable performance gain always wins), or a rare case
  that reads better at 3 than split. Each `if`, loop, `try`, `switch` and inline callback
  whose body holds statements adds one level; an `else if` stays at the level of its
  `if`; a named function, declared or assigned to a `const`, starts its own count at 0.
  Return early, extract the inner loop's body, or name the callback.
- **G3. Parameters.** At most 3 positional parameters; beyond that, pass one object with
  named fields. No call passes `undefined` or `{}` only to reach a later argument. The
  object's type is named for what it describes (`AccessTokenIssueRequest`, or
  `<Owner>Options` for configuration), never for the function (`IssueParams`), and the
  function destructures the fields it uses once, in its signature or on its first line.
  A published signature keeps its parameters; the limit applies to new code and to
  signatures that can change without breaking a caller.
- **G4. Dependencies.** At most 6 constructor dependencies. More means the class does
  more than one job: split it.
- **G5. Ternaries.** No nested ternary. A conditional expression that spans more than
  three lines, or that builds an object inside a call argument, becomes a named `const`.
- **G6. Guard clauses.** Reject the not-found, not-allowed and invalid cases first and
  return or throw early, so that the main path stays unindented. Prefer an early exit to
  an `if` that wraps the rest of the body.
- **G7. Comments.** Follow `AGENTS.md`, Documentation and comment policy: commands,
  queries, handlers and ordinary entities carry no inline comments. When a step needs
  one, rename or extract instead. A comment elsewhere explains why, never what.
- **G8. Names.** Follow `AGENTS.md`, Naming. Names are short, clear and simple. A method
  does not repeat its receiver: `dispatcher.enqueue(...)`, not
  `welcomeEmailDispatcher.enqueueWelcomeEmail(...)`. Library, helper and other reusable
  code names the general concept, not its first caller (`joinKeySegments`, `textRule`,
  not `buildUserCacheKey`). A conventional role name carries two or three words because
  the convention asks for them (`RenameRoleCommand`, `GetUserOverviewHandler`,
  `UserCreatedEvent`); that length is expected.
- **G9. Conditions.** At most 3 operands joined by `&&` and `||` in one `if`, `while` or
  ternary condition. A longer condition becomes a named boolean `const` that says why
  (`needsRefresh` in `references/examples.md`, example 6).
- **G10. No `else` after an exit.** When a branch ends in `return`, `throw`, `continue` or
  `break`, the code after it is not wrapped in `else`.
- **G11. Numbers explain themselves.** A number other than 0 and 1 states its meaning
  through the option or property it sets (`ttl: 60_000`, `maxAttempts: 3`) or the variable
  it initializes. Otherwise, and whenever the same tuning value appears twice, it becomes
  a module-level `UPPER_SNAKE` constant with a unit suffix (`DEFAULT_IDEMPOTENCY_TTL_MS`,
  `GRACE_SECONDS`). A unit conversion (`* 1000`) needs no constant. Large literals use
  digit separators (`86_400_000`).
- **G12. Refusals come before work.** Every check of the arguments and of the state (a
  `throw`, a not-found, an authorization) runs before the first write, event or external
  call. A factory or decorator checks its options when it is created, not on first use, as
  `textRule` and `ApplyMutation` do. A throw leaves nothing half-built: `applyPatch`
  normalizes every field before it writes any.
- **G13. Decisions take `now`.** A domain method that depends on time takes it as a
  parameter (`auth.refresh(presentedHash, nextHash, now, graceMs)`). The application reads
  the clock once per operation (`Date.now()` in the handler) and passes it down, so every
  check and write of that operation agrees on the time. A result with more than two cases
  is a named union (`RefreshOutcome = 'rotated' | 'grace'`), not a boolean with a value
  beside it.
- **G14. Code lives where it is used.** A helper with one caller stays in the caller's
  file, below the code that uses it (`capabilityLabel`, `buildConditions`). It moves to
  the folder's `helpers/` when a second file uses it (`firstHeaderValue`) or when it is
  tested on its own. Pipeline options follow C7.
- **G15. Layout.** The statements of one logical step sit together, one under the other,
  with no blank line between them. One blank line separates two steps (load and guard,
  decide, act, return). A `return` that ends a multi-step body stands apart; a short
  body that does one thing (create, configure, return) keeps its `return` with it. Do not put a
  blank line after every statement of one step, and do not run several steps together
  without one.
- **G16. Early exit without contortions.** An early exit must make the code simpler. When
  reaching it would need a new `let` temporary, or would read more complex than the
  nested form, keep the nested form.

## Library rules

These apply to `packages/*`, together with the general rules and `AGENTS.md`, Library
scope. Every exported symbol there is public API that consumers read in their editors.

- **L1. Errors name the subject and what is accepted.** A bad argument or option is a
  `TypeError` whose message starts with the subject and states what is accepted:
  `'textRule: minLength must not exceed maxLength.'`, `'Capability subject must be a
  non-empty string.'`. It may name the fix (`'… such as a BullMQ, RabbitMQ or PostgreSQL
  transport.'`). A domain, concurrency or protocol failure is a named class (D7). A message
  never carries a secret or a personal value.
- **L2. No silent failures.** A `catch` that does not rethrow reports the error to the
  logger or handler the caller supplied (`ctx.logger?.warn?.(...)`), or states in one short
  comment why ignoring it is safe (`// Diagnostics must not replace the handler result or
  cache-store error.`). No `try` that only rethrows, and no handling for a state that
  cannot occur.
- **L3. A class holds shared state.** A class holds state its methods share (a store, a
  client, a timer). Logic without state is an exported function, as `textRule`,
  `operationIdempotencyKeyFactory` and `projectUserRead` are.
- **L4. Earned generality.** A type parameter, interface or abstract class needs two
  implementations or callers today, or must be an extension point that consumers implement
  (a store, a transport, a port). A wrapper around a dependency used in one place is not
  added.
- **L5. No unrequested surface.** An option, parameter, overload or export the task did not
  ask for is not added. Each one needs JSDoc with an `@example`, full coverage, and becomes
  a compatibility promise. Configuration arrives only through options and constructor
  arguments (`AGENTS.md` rule 3).

## When not to add an abstraction

- **A1.** Do not add an interface with one implementation unless it is a port at a
  boundary the application does not own (a database, a queue, a token issuer, a mail
  sender). Never add one only so a test can replace it: mock the module (`AGENTS.md`
  rule 17).
- **A2.** Do not add a generic repository, a generic base handler, or a base class beyond
  `RootEntity`, `CommandBaseHandler`, `QueryRepository` and `AggregateRepository`. One
  repository class per operation is the convention, and near-identical handlers stay
  separate classes.
- **A3.** Do not add a pipeline behavior when an existing behavior with options does the
  job. A new behavior package needs an owner decision.
- **A4.** Do not add a domain service when one aggregate method suffices. When a rule
  truly spans several aggregates, ask the owner before adding one.
- **A5.** Do not add a bounded context, a layer, a new kind of folder or a package without
  an owner decision.
- **A6.** Do not add a value object for a single field that a value rule already covers,
  and do not add an application service that a route calls to change state.

## Workflow

0. **Work inline.** Delegate only when the change spans more than one workspace, to at
   most two `cqrs-ddd-refactor` agents (`.claude/agents/cqrs-ddd-refactor.md`) with
   disjoint files.
1. **Identify** the bounded context and the kind of change: command, query, domain change,
   event, route, refactor or review. Open only the section of
   [references/style.md](references/style.md) for that kind and the one file its "Copy
   from" table names (for a change handler,
   `api/src/users/application/cqrs/commands/update-user.handler.ts`), and copy its shape.
   Never copy an item listed under "Existing deviations" in `references/conventions.md`.
2. **State the design in 3 to 6 bullets**: the names (command, method, event), the files
   to add, the pipeline entries, what the aggregate enforces and what the schema checks.
   In a package, state instead which function or module changes, why that place owns it
   (G14), and whether the public API changes. Name the test that proves the change; for a
   bug, the test that reproduces it comes first.
3. **Implement the smallest readable solution** that follows the existing patterns.
   Register a new handler in `api/src/app.ts` (`cqrs.register(new ...Handler(...))`) and a
   new route in `<context>/routes.ts`.
4. **Run the real checks.** `pnpm --filter <workspace> test` (the api's runs `pnpm build`
   first), `pnpm --filter <workspace> lint` (`tsc --noEmit`), `pnpm exec biome check` on
   the changed files and `pnpm lint:plugins` (the Grit architecture checks). Run
   `pnpm test:e2e` when a route or persistence changes and Docker is available. Packages
   keep 100% per-file coverage.
5. **Self-review and report.** Check the diff against the checklist below and report
   every "no" with its reason, the commands you ran with their real results, and any
   refactoring candidates in the format below.

## Reviewing a diff or a file

- Apply the checklist to the changed lines. Report each "no" as
  `path:line, rule, measured value (limit), suggested fix`.
- List violations in unchanged code separately, under "Refactoring candidates".
- Measure; do not estimate. Do not rewrite code during a review unless asked.

```text
Refactoring candidates (not changed):
- packages/mikro-orm/src/concurrency/optimistic-update.ts optimisticUpdate: G3, 5 positional parameters (limit 3). Published API: an options form needs an owner decision.
- packages/pipeline/src/services/pipeline-runner.ts createPipelineRunner: G3, 5 positional parameters (limit 3). Published API: an options form needs an owner decision.
```

## Self-review checklist

Every answer should be "yes"; explain each "no". Items 2 to 12 apply to bounded-context
code; the others apply everywhere the rules do.

1. Does every new file sit in the folder and carry the suffix its kind uses
   (`references/conventions.md`), and follow the shape `references/style.md` gives for
   its kind?
2. Do domain source files import only `@cqrs-ddd/core/domain` and their own context's
   `domain/`?
3. Does every name come from the context's language, without a prefix or suffix its
   context already gives?
4. Do the command, the aggregate method and the event share one verb, with the event in
   the past tense?
5. Is every state change made by a factory or an `@ApplyMutation` method, with no public
   setter and no `fromJSON` used to fake a change?
6. Does the aggregate enforce every invariant the change introduces, even where a schema
   checks it first?
7. Is each limit stated once, as a value rule, with schemas reading it or deriving from
   the command schema?
8. Does each handler read as load → not found → authorize → one domain call → save →
   return, with no branch that decides a business outcome?
9. Does each command handler return the aggregate (or `{ aggregate }`), with no code
   publishing or uncommitting events by hand?
10. Does each query handler leave state unchanged and return a read model or plain data,
    not an aggregate?
11. Are cross-cutting concerns only in `@UsePipeline`, with an option repeated a third
    time extracted to `api/src/common/<behavior>/`?
12. Does each route dispatch exactly one command or query, with no domain rule, repository
    call or state-changing service call?
13. Are `handle`/`execute` bodies at most 30 lines and other bodies at most 40, or is a
    longer one kept whole for a reason the review states? Is nesting at most 2 (3 only
    for a stated performance or readability reason), with no early exit that needs a new
    `let` or reads worse than the nesting it replaces,
    positional parameters at most 3 outside published signatures, constructor
    dependencies at most 6, with no nested ternary, and is every step separated from the
    next by one blank line, with none inside a step?
14. Does every condition have at most 3 operands, with no `else` after an exit, and does
    every number other than 0 and 1 state its meaning or come from a named constant?
15. Does every check of the arguments and the state run before the first write, event or
    external call, with time passed into the domain rather than read there?
16. Does every new helper live in the file of its only caller, or in `helpers/` only when
    a second file uses it or it is tested on its own?
17. In a package, does every throw name its subject and what is accepted, does every
    `catch` that does not rethrow report the error or say why it is safe, and does every
    new class hold state its methods share?
18. Did the change avoid every interface, base class, type parameter, behavior, domain
    service, value object, option, export, layer and context that the task did not need?
19. Does every new test title state a behavior, with domain rules tested on the aggregate
    and handler specs testing orchestration only?
20. Did `test`, `lint`, `check` and `lint:plugins` run, and does the report state their
    real outcome?
21. Is every change in the diff traceable to the request, with existing violations
    reported instead of fixed?

## When not to use this skill

- Persistence lifecycle decorators, cache coordination, idempotency and short-circuit
  keys, tenant handling or the pipeline engine: use `cqrs-ddd-architecture` and
  `AGENTS.md` rules 5 to 16.
- The application rules (D, C) inside `packages/*`: library scope (`AGENTS.md`) governs
  there, with the general and library rules of this skill.
- Documentation, READMEs, context files, build scripts, CI, migrations and schema files.
- Generated output (`dist/`, `coverage/`, the generated sections of the codebase map) and
  the text of an SQL statement or a script embedded in code; its lines still count toward
  the function that holds it.
- Mechanical changes with no design content: dependency bumps, `pnpm format`, a rename
  that `tsc` checks.
- A question or investigation that changes no code.
