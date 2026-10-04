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
A placement review (2026-10-04, owner) changed the API before the first publish, so 8.3's
verification reruns: see 8.3a.
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
- [ ] 8.3a Placement review (owner, 2026-10-04), uncommitted: `@UsePipeline`,
  `@SkipPipeline`, `pipelineOf` and their types moved from `@cqrs-ddd/cqrs` to
  `@cqrs-ddd/pipeline` (`src/handler-pipeline.ts`), so the plugin, which keeps
  `@nestjs/cqrs`, uses them without `@cqrs-ddd/cqrs`; removed the unused NestJS copies
  `Command<R>`, `Query<R>`, `RESULT_TYPE_SYMBOL`, `CommandResult`, `QueryResult`,
  `EventPublisher` and `cqrs.eventPublisher`, the exports `commandOf`, `queryOf`,
  `eventsOf`, and `CACHE_TOKEN` of core; `HttpCorrelationMiddleware` became
  `httpCorrelation(options)`; NestJS DI examples left the JSDoc and the core and
  mikro-orm pages. Then (owner, 2026-10-04): the package-only suites left in `api/test`
  moved to `integration/pipeline/` and `integration/docs/` (the prototype-patching tests
  of the old plugin dropped); `integration/` gained three applications that use one
  package family each (`payments/`, `library/`, `inventory/`) at 100% coverage; `api`
  and `integration` report coverage; the Archify skills moved to `.archify/skills/`.
  Remaining before the owner's commands: `pnpm verify:all` and
  `pnpm --filter ddd-cqrs-api test:e2e` (needs Docker).
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
- Handler-class pipeline declarations belong to `@cqrs-ddd/pipeline`; `@cqrs-ddd/cqrs`
  keeps the buses and the handler decorators (owner, 2026-10-04).
- The default OpenTelemetry tracer and meter name is `'@cqrs-ddd/pipeline-opentelemetry'`;
  the plugin passes `'nestjs-pipeline'` to keep its scope name (owner, 2026-10-03, Q8).

## Modified Files

The 8.3a changes are committed on `develop`.

## Tests and Verification

Last full run: `pnpm verify:all` exit 0 on 2026-10-03 (2,870 Vitest tests, 7
`node --test` cases, release check of 20 packages); `pnpm --filter ddd-cqrs-api test:e2e`
exit 0 the same day (34 files, 358 tests, Docker).

On the 8.3a tree (2026-10-04): `pnpm build`, `pnpm lint`, `pnpm check` and `pnpm
lint:plugins` exit 0; every workspace's tests pass (mikro-orm 186/186 after its
`@mikro-orm/core` peer moved to `^7.2.3`, the range it develops and is tested against);
`pnpm docs:build` exit 0, all internal links valid. `biome.json` excludes the generated
Archify output (`.archify`, `.agents/skills/archify`,
`docs/public/architecture-diagram.html`). End-to-end not run: Docker was down.

## Risks

- Two installed versions of a stateful package (`pipeline`, `pipeline-tenant`,
  `pipeline-correlation`, `pipeline-job-context`) split its store; they stay peer
  dependencies of every package that imports them.

## Open Questions

- Q7 (non-blocking): dead-letter redrive for plain functions: a name-to-function map in
  the redriver options?
- Q6 (non-blocking): a combined HTTP error mapper in a package, or each application's own
  `answer(error)` only, as `api/src/http/answer.ts` does?
- Q10 (decide before the plugin starts): nestjs-pipeline's `api` keeps every line only if
  `@nestjs-pipeline/<name>` re-exports the neutral API of `@cqrs-ddd/pipeline-<name>`
  (`export *` plus its own NestJS `XxxModule`). That reverses "No re-exports between the
  two scopes" in `adopt-cqrs-ddd-packages.md`. Record the answer there when nestjs-pipeline
  unfreezes. The same holds for `UsePipeline` and `SkipPipeline`, now in
  `@cqrs-ddd/pipeline`: the plugin re-exports them from `@nestjs-pipeline/core` and its
  discovery reads `pipelineOf()`; its `PIPELINE_*_METADATA` symbols go, and the five
  `api` specs that read them switch to `pipelineOf()`. Its plan table still lists the two
  decorators as plugin code; correct it then.

## Next Steps

1. Commit 8.3a.
2. `pnpm verify:all` and the end-to-end suites.
3. The owner runs the commands of 8.3.
4. Step 8.4.

## Snapshot Impact

None for the release itself.

## Last Updated

2026-10-04
