# CLAUDE.md

Durable working instructions for Claude Code. [AGENTS.md](AGENTS.md) holds the full rules, the
context-file workflow and every command, and wins over this file. Package code changes only
here; nestjs-pipeline installs it ([AGENTS.md, The two repositories](AGENTS.md#the-two-repositories)).

## Read first

1. [AGENTS.md](AGENTS.md), then the [codebase map](.claude/codebase-map.md): an index, not an authority; the source wins.
2. [cqrs-ddd-readability](.agents/skills/cqrs-ddd-readability/SKILL.md) for commands, queries, handlers, aggregates, events, routes and reviews; [cqrs-ddd-architecture](.agents/skills/cqrs-ddd-architecture/SKILL.md) for persistence, caching, idempotency and behaviors.
3. The nested `CLAUDE.md` of the package in scope, and the active `.claude/tasks/<task-id>.md`; create one from `TEMPLATE.md` for multi-step work.
4. After compaction, re-read this list in order, plus `.claude/state/context-checkpoint.md` if it exists.

## The ten rules that matter most

1. Repository conventions beat textbook DDD/CQRS advice. When the code and a rule disagree, report it; do not pick one silently.
2. No package but `packages/nestjs` imports NestJS; pipeline and DDD packages stay independent; packages read no environment (AGENTS.md rules 1 to 3).
3. Aggregates change only through factories and `@ApplyMutation` methods named for the business verb, and enforce their own invariants through value rules (rule 7; skill D2 to D5).
4. Handlers orchestrate: load, not found, authorize, one domain call, save, return the aggregate. Only `CommandBaseHandler` publishes events (rule 8; C3, C5).
5. A command, its aggregate method and its event share one verb; queries are `Get<WhatItReturns>Query` and never write (C1, C2, C4, D6).
6. Cross-cutting concerns are `@UsePipeline` entries; short-circuit keys carry tenant, principal and permission scope and fail closed (C6; rule 5).
7. Each validation rule has one owner: limits in `Aggregate.rules`, read by the command schema, derived by route schemas (C10).
8. `handle`/`execute` at most 30 lines, other bodies 40 (longer only when a split reads worse), nesting 2 with early exits, positional parameters 3, constructor dependencies 6; no speculative interface, base class, behavior, layer or context (G1 to G5, A1 to A6).
9. Short declarative names from the context's language; no comments in commands, queries, handlers or entities; useful JSDoc with `@example` on exports; no slop, banners or ticket ids (Naming; rules 18, 19).
10. No production surface for tests, surgical changes only, never loosen a Grit plugin, and never put secrets or personal data in code or context files (rules 17, 20; Secrets).

## Commands

pnpm only, never `npm` or `yarn`. The full table is in [AGENTS.md, Commands](AGENTS.md#commands).

| Purpose | Command |
| --- | --- |
| Install | `pnpm install` |
| One workspace's tests | `pnpm --filter <package-name> test` |
| Every workspace's tests, after the Grit plugin diagnostics | `pnpm test` |
| Type checks | `pnpm lint` |
| Architecture checks (Grit plugins) | `pnpm lint:plugins` |
| Format and lint (Biome) | `pnpm check`, `pnpm format` |
| The api's end-to-end suites (needs Docker) | `pnpm test:e2e` |
| Everything | `pnpm verify:all` |
| Regenerate and validate the codebase map | `pnpm context:update`, `pnpm context:validate` |

Run the narrowest check first; before reporting work as done, run the affected workspace's
tests and `pnpm lint:plugins`.
