# Task Context

## Task

Test nestjs-pipeline on the `@cqrs-ddd` packages locally, before anything is published
to npm; keep the old `@nestjs-pipeline` packages on npm with a prominent message that
redirects to the new packages, and test that message before the new packages are
published (owner, 2026-10-04).

## Goal

- nestjs-pipeline's `api` builds and passes its unit and end-to-end suites on the
  `@cqrs-ddd/*` 0.5.0 packages installed from local tarballs or a local registry, never
  from npm.
- Every gap the trial finds in a `@cqrs-ddd` package is fixed here before 0.5.0 is
  published.
- The deprecation messages of the old packages are written and shown working against a
  local registry; the owner runs the real `npm deprecate` commands.

## Scope

In: packing this repository's packages, a throwaway clone of nestjs-pipeline under the
scratch directory, fixes to `packages/*` here, the deprecation messages and commands.

Out: any change in `~/Source/nestjs-pipeline` itself, which stays frozen; the trial works
on a clone and leaves the original untouched. Publishing and deprecating on npm are the
owner's actions.

## Current Status

Not started. Release step 8.3 of `cqrs-ddd-pipeline.md` waits for this task.

## Plan

- [ ] 1. Local packages: pack the 20 packages at 0.5.0 into tarballs, as
  `integration/release/release.mjs` does, or publish them to a local registry (Q1).
- [ ] 2. Clone `~/Source/nestjs-pipeline` into the scratch directory (`git clone`, so the
  original repository gains nothing, not even a worktree entry).
- [ ] 3. In the clone, point every `@cqrs-ddd/*` dependency at the local packages with
  `pnpm.overrides` (`file:` tarballs) or the local registry, and apply the plan of
  `nestjs-pipeline/.claude/tasks/adopt-cqrs-ddd-packages.md`: Phase 1 (the plugin over
  `@cqrs-ddd/pipeline`, `UsePipeline` and `SkipPipeline` re-exported per Q10 of
  `cqrs-ddd-pipeline.md`, discovery through `pipelineOf()`) and Phase 2 (`api` on the
  packages).
- [ ] 4. Run the clone's `pnpm verify:all` and `pnpm test:e2e` (Docker).
- [ ] 5. For each failure caused by a `@cqrs-ddd` package: fix it here, repack, reinstall
  in the clone, rerun. Record each gap and its fix under Decisions.
- [ ] 6. Deprecation messages, one per old package (wording per Q2), applied to versions
  `<0.5.0` only, so 0.4.x stays installable; retired packages (`@nestjs-pipeline/tenant`,
  and `@nestjs-pipeline/opentelemetry` per the plugin task's Q1) are deprecated as a
  whole.
- [ ] 7. Test the messages on the local registry: publish a 0.4.2 copy there, run
  `npm deprecate --registry <local>`, install it and read the warning; then install
  0.5.0 and check that no warning appears.
- [ ] 8. Save the clone's diff as a patch in the scratch directory, as the starting point
  of the real adoption when nestjs-pipeline unfreezes; delete the clone.
- [ ] 9. Hand over: the owner publishes 0.5.0 (`cqrs-ddd-pipeline.md` 8.3), then runs the
  `npm deprecate` commands of step 6.

## Decisions

- The trial runs on a clone, so the frozen nestjs-pipeline repository is never written
  (owner rule: no change there until ddd-cqrs is complete).
- Old packages are deprecated, never unpublished: existing installs and lockfiles keep
  working, and npm shows the message on the package page and at every install.

## Modified Files

- `.claude/tasks/nestjs-pipeline-local-trial.md`: this file.

## Tests and Verification

Not started.

## Risks

- A tarball install and an npm install can differ (a missing `files` entry, a peer
  range). The release check already installs each tarball alone; the local registry
  (Q1) also covers the publish step itself.
- Two copies of a stateful package (`pipeline`, `pipeline-tenant`, `pipeline-correlation`,
  `pipeline-job-context`) split their stores; the clone must resolve one copy of each.
- `npm deprecate` with a wrong range deprecates the new versions too; step 7 checks the
  range on the local registry first.

## Open Questions

- Q1 (blocking step 1, library choice): tarballs with `pnpm.overrides` only, or also a
  local registry such as Verdaccio? Tarballs need no new tool; a local registry is the
  only way to test `npm deprecate` (step 7) and the publish flow itself.
- Q2 (blocking step 6): does `@nestjs-pipeline` continue as the NestJS plugin at 0.5.0, as
  the adoption task plans, with only the old versions deprecated ("0.4.x is superseded:
  the framework-neutral code is now `@cqrs-ddd/*`; the NestJS plugin continues from
  0.5.0")? Or are the `@nestjs-pipeline` packages retired entirely, with every version
  pointing to `@cqrs-ddd/*`?

## Next Steps

1. The owner answers Q1 and Q2.
2. Step 1.

## Snapshot Impact

None: no change to this repository's architecture, unless step 5 finds a gap.

## Last Updated

2026-10-04
