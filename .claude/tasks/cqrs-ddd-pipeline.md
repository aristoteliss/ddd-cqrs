# Task Context

## Task

Build a framework-agnostic `@cqrs-ddd` ecosystem in this repository that holds the one
implementation of every pipeline behavior, publish it, and then turn the
`@nestjs-pipeline/*` packages into a NestJS plugin built on it.

## Goal

- This repository builds, tests and publishes the `@cqrs-ddd` packages at 0.5.0, first
  under the `next` dist-tag.
- nestjs-pipeline's `api` then runs on the published packages, through `@nestjs-pipeline/*`
  packages that hold only NestJS glue.

## Scope

In: the release of this repository's packages (Phase 8). Out: the plugin rewrite, which
is planned in `nestjs-pipeline/.claude/tasks/adopt-cqrs-ddd-packages.md` and starts only
when this repository is complete and published (nestjs-pipeline is frozen until then,
task-file syncs included).

## Current Status

The runtime task and the example application (`api/`) are done (2026-10-03), so 0.5.0 ships with both.
Phases 0 to 7 (skeleton, moved packages, engine, context and behavior packages, DDD
bridge, documentation and examples) and steps 8.1 and 8.2 are done and committed on
`develop`; their record is the git history.

## Plan

- [x] 8.1 `pnpm verify:all` passes (2026-10-02, on the Phase 7 tree).
- [x] 8.2 Every workspace at `0.5.0`; repository, homepage and bugs links per package;
  `CHANGELOG.md` with the 0.5.0 entry (2026-10-02).
- [x] 8.3 Rerun `pnpm verify:all`, update the CHANGELOG entry with
  what it added, prepare the release commit and the exact publish command; the owner
  publishes. Done 2026-10-03: CHANGELOG lists the example application; `pnpm verify:all`
  passed (2870/2870 Vitest tests, 7/7 `node --test`, 20 packages packed and installed
  alone); `pnpm -r publish --dry-run --tag next --access public --no-git-checks` packed
  all 20 packages at 0.5.0; npm has none of them at 0.5.0 (`core` and `uuidv7` end at
  0.4.2, the new packages do not exist yet). `origin/master` is an ancestor of
  `develop`. The owner's commands, from a clean checkout:
  `git push origin develop`, `git checkout master`, `git merge --ff-only develop`,
  `git push origin master`, `pnpm install --frozen-lockfile`, `pnpm verify:all`,
  `npm whoami`, `pnpm publish:all --tag next`. A package published for the first time
  with `--tag next` also gets `latest` from the registry, which has no other version
  to point it at.
- [ ] 8.4 A scratch consumer installs the published packages from npm and runs the
  plain-function example.

## Decisions

- One implementation, in `@cqrs-ddd`; the NestJS plugin is a set of adapters over it
  (owner, 2026-10-01).
- Lockstep `0.5.0` for every package, first under `next` (owner, 2026-10-02, Q4).
- The owner runs every publish and push; agents commit on `develop` only after asking,
  never on `master`, and prepare the release commit and command (owner, 2026-10-02).
- The packages keep only what has to do with CQRS and DDD, with no container or module
  classes (owner, 2026-10-03, AGENTS.md rule 1); the plugin's NestJS modules wrap the
  behavior classes directly.

## Modified Files

None open; everything is committed.

## Tests and Verification

Last full run: `pnpm verify:all` exit 0 on 2026-10-03 (2,870 Vitest tests, 7
`node --test` cases, release check of 20 packages); `pnpm --filter ddd-cqrs-api test:e2e`
exit 0 the same day (34 files, 358 tests, Docker).

## Risks

- Two installed versions of a stateful package (`pipeline`, `pipeline-tenant`,
  `pipeline-correlation`, `pipeline-job-context`) split its store; they stay peer
  dependencies of every package that imports them.

## Open Questions

- Q7 (non-blocking): dead-letter redrive for plain functions: a name-to-function map in
  the redriver options?
- Q8 (non-blocking, before the plugin): the default tracer and meter name of
  `@cqrs-ddd/pipeline-opentelemetry` is still `'nestjs-pipeline'`; change it to the
  package name and let the plugin pass `'nestjs-pipeline'`?
- Q6 (non-blocking): a combined HTTP error mapper in a package, or each application's own
  `answer(error)` only, as `api/src/http/answer.ts` does?
- Q10 (decide before the plugin starts): nestjs-pipeline's `api` keeps every line only if
  `@nestjs-pipeline/<name>` re-exports the neutral API of `@cqrs-ddd/pipeline-<name>`
  (`export *` plus its own NestJS `XxxModule`). That reverses "No re-exports between the
  two scopes" in `adopt-cqrs-ddd-packages.md`. Record the answer there when nestjs-pipeline
  unfreezes.

## Next Steps

1. The owner runs the commands of 8.3.
2. Step 8.4.

## Snapshot Impact

None for the release itself.

## Last Updated

2026-10-03
