# Task Context

## Task

Carry out the consolidated promotion and release-readiness review of 12 October 2026
(`ddd-cqrs-promotion-review-updated.md`, kept outside the repository): correct the public
claims, give a complete first run, expose verification in CI, reorganize the README and
landing page, then support the owner's own launch on Hacker News and DEV.

## Goal

A first-time visitor can tell what the project solves, which package to install, which
adoption path fits, the Node minimum and the license, and can copy one example into an
empty directory and run it. Every guarantee stated in the README, the English and Greek
documentation and the package READMEs matches the implementation. A public CI run is
green on the commit being promoted. When the owner posts, every fact the owner may cite is
verified, the first runs pass from the published packages that day, and a tracker records
what each post brought.

## Scope

In scope, in this repository:

- `docs/src/content/docs/` and its Greek mirror `docs/src/content/docs/el/`.
- Root `README.md` and the package READMEs under `packages/*/`.
- `.github/workflows/` (the verification workflow beside `docs.yml`).
- `packages/*/package.json` keywords and publishing metadata.
- Executable first-run examples under `integration/` and `demo/`, reused by the documentation.
- `.claude/launch/` (git-ignored): `launch-facts.md` and `launch-tracker.md`.

The sibling repository has its own task:
`~/Source/nestjs-pipeline/.claude/tasks/hn-devto-routing.md`.

Out of scope:

- Any change to package behavior or architecture. The review asks for none.
- A `ddd-cqrs` meta-package (deferred) and any package rename.
- `npm deprecate` or unpublishing of 0.1–0.4 (`AGENTS.md` forbids both).
- Licensing model and pricing decisions, which are the owner's.
- Writing or rewriting articles, Show HN text, comments or replies: the owner's own writing
  (owner, 2026-10-16). Publishing, posting and submitting are owner actions.

## Current Status

in progress. Steps 1 to 5 are done and committed on branch `promotion-readiness` (head
`d4ea1f0`), open as draft pull request 1 with four passing checks; what remains of them needs
the merge or the owner. On 2026-10-16 the migration page of step 7 was written and committed
on the branch, and the facts file and tracker of step 8 were written (git-ignored). What
remains of steps 6 to 9 needs the merge, a post date or the owner. The launch task
`launch-hn-devto.md` is merged into this file.

### Baseline (verified 2026-10-16)

- npm: `@cqrs-ddd/pipeline`, `@cqrs-ddd/nestjs` and `@cqrs-ddd/core` have `latest` and `next`
  at 0.5.0. Downloads last week: 12, 13 and 33 (CI and bots included).
  `@nestjs-pipeline/core` 0.4.3: 84; `@nestjs-pipeline/cqrs-ddd` (the facade): 11.
- GitHub: 1 star, 0 forks, 0 issues, licence detected as AGPL-3.0.
- Docs site: the landing page, getting started and `guides/from-nestjs/` return 200.
- The deployed docs have no page that maps `@nestjs-pipeline` 0.4.x to `@cqrs-ddd` 0.5.0; the
  page of step 7 is on the pull request branch and goes live with the merge.
- `COMMERCIAL_LICENSE.txt` has the marginal brackets and a worked example, committed on the
  pull request branch; the nestjs-pipeline copy is committed in `b1ed5e0`.
- The nestjs-pipeline README routing ("New applications" first, "The 0.4.x line" below) is
  committed in `b1ed5e0`.
- The two article drafts an agent wrote on 2026-10-13 were deleted from `.claude/launch/` on
  2026-10-16 (owner); their checkable claims are listed under step 8. Identical copies stay in
  the replaced branch commit `f145753` (`.claude/drafts/`), reachable on GitHub by its ID.

## Plan

Steps 1–5 gate targeted evaluation; the launch (step 8) waits for green public CI on `master`.

- [x] 1. Correct public contracts and migration routing: the bounded idempotency guarantee
  with "Guarantees and Limits"; execution order; universal runtime and performance wording
  removed; the in-process `EventBus` limit; the two NestJS paths and "What Is Not Included";
  navigation links valid. English and Greek agree.
- [x] 2. One complete first-run example: `integration/plain-node/create-order.mjs` quoted whole
  by the README and both getting-started pages, with its test; the CQRS first run
  (`integration/standard-decorators/create-user.mts`); the minimal NestJS module
  (`integration/nestjs/invoices.ts`). All three verified as clean consumers of the published
  0.5.0 packages on Node.js 22.12.0 and 24.13.0.
- [ ] 3. Verification in CI
  - [x] `.github/workflows/verify.yml`: jobs `verify` (Node.js 22.17.0 and 24, with Bun),
        `e2e` (Docker) and `minimum-node` (22.12.0); all pass on pull request 1.
  - [ ] The README badge reads `master`: it shows a status after the merge.
- [ ] 4. README and landing page
  - [x] README order, landing pages, overview pages, "this project's adapter for NestJS".
  - [ ] Badge (step 3).
- [ ] 5. Package discovery
  - [x] Keywords, runtime table, npm README diagnosis, install lines audited for all 21
        packages, release steps publish on the default tag.
  - [ ] Publish so that the five affected packages get their README on npm (owner).
- [ ] 6. Online demo
  - [x] `demo/`: the first example on the published packages, outside the workspace, tested
        against the integration copy.
  - [ ] Open it on StackBlitz after the merge
        (`https://stackblitz.com/github/aristoteliss/ddd-cqrs/tree/master/demo`) in a fresh
        session. Not tested: whether WebContainers provide the Node.js version and
        `AsyncLocalStorage` the packages need.
  - [ ] Add a "Try it" link only if that works.
- [ ] 7. NestJS audience first
  - [x] nestjs-pipeline README routing (committed in that repository, `b1ed5e0`).
  - [x] `guides/from-nestjs-pipeline.md` and its Greek mirror, linked from the README's "Choose a
        path" and from both `guides/from-nestjs.md`. Written from the exports of the fourteen
        0.4.3 tarballs and their 0.5.0 successors, read with the TypeScript compiler API: the
        eight add-on NestJS modules, their tokens and the five filters are gone; `PipelineModule`,
        `ErrorFilter`, `CorrelationMiddleware` (was `HttpCorrelationMiddleware`) and
        `JobContextModule` are in `@cqrs-ddd/nestjs`; behavior constructors keep their arguments.
        Verified 2026-10-16: every symbol the page names exists in the tarball it names; the
        page's 0.5.0 module runs on the published packages (Node.js 24.13.0 and 22.12.0: one
        handler run for two calls, one audit record) and, in a temporary spec on the workspace
        packages, startup fails without a behavior provider;
        `build:site` 1309 pages, all internal links valid; `pnpm context:validate` 58 passed.
  - [ ] Keep the accepted Awesome NestJS entry, no duplicate listing; three to five evaluators
        (owner).
- [ ] 8. Launch on Hacker News and DEV, in the owner's own words
  - [x] `.claude/launch/launch-facts.md` (2026-10-16): thirteen sections, each fact with a file
        and line or a dated command; "Derived" marks a conclusion no spec asserts; sections
        "Contradictions" and "Not verified" at the end. Line numbers follow the working tree of
        2026-10-16. It holds the checkable claims of the deleted drafts, corrected:
        - Execution order is global `before`, the handler's own, global `after`, then the
          handler; results return in reverse.
        - The idempotency placement rule is "after `CaslBehavior`" only, and a broken rule fails
          at startup only in `diagnostics: 'strict'`, the default.
        - `globalBehaviors` reach every handler within their `scope`, less `@SkipPipeline`.
        - A crash leaves an `in_progress` claim only in a shared store; the memory store loses
          its records with the process.
        - 422 (`key_reuse`) and 409 (`in_progress`, `replay_scope`) are confirmed in source and
          specs; no end-to-end test asserts 409.
        - `@cqrs-ddd/mikro-orm` needs Node.js 22.17; the other twenty packages 22.12.
  - [ ] On the day of each post, before the owner publishes: the three first runs from the
        published packages in a clean directory on Node.js 22.12.0 and 24; the docs links the
        post uses; on request, the owner's text checked against `launch-facts.md`, with
        differences reported and the text left unedited.
        → verify: each run's output and date in the tracker.
  - [x] `.claude/launch/launch-tracker.md` (2026-10-16): the playbook's step 16 table with a row
        per planned post, the baseline of both repositories (stars, traffic, downloads), weekly
        capture, signals, the first-runs log with the six baseline runs of 2026-10-16,
        questions, and the decision rules. One tracker for both repositories.
  - [ ] After each post: URL, date and outcome recorded; a question asked twice becomes a
        documentation fix or a recorded reason not to.
- [ ] 9. Later, the owner's choice: awesome-ddd, awesome-typescript, awesome-nodejs, after
  feedback and under each list's current rules. Not all on one day.

### Channel rules, for reference (read from the pages on 2026-10-16)

- Hacker News: Show HN is for "things people can run on their computers"; "blog posts" are off
  topic, so the link is the repository. "Please make it easy for users to try your thing out,
  ideally without barriers such as signups or emails." "Please don't put generated text in HN
  posts"; in comments, "Don't post generated text or AI-edited text." "Please don't ask friends
  to upvote or comment." "Please don't delete and repost." Upgrades "generally aren't
  substantive enough to be Show HNs."
- DEV: at most four tags; `published: false` keeps a draft; cover image best at 1000 x 420.
  AI-assisted articles must say so and should not "Promote any business, program, or course
  (including your own)"; Terms section 11 rejects content "designed primarily for the purposes
  of promotion or creating backlinks".

## Decisions

- Public label is **CQRS-DDD**; `ddd-cqrs` is the repository, `@cqrs-ddd/*` the npm
  namespace. No rename, no facade package. Rejected: a `ddd-cqrs` meta-package — one more
  public contract and release obligation for a naming concern.
- Lead: "Reusable behavior pipelines for TypeScript functions and CQRS handlers—with
  optional DDD building blocks and a NestJS adapter." "MediatR-style" is a secondary
  message for .NET readers, never a claim of compatibility or parity.
- The comparison is by responsibility (plain wrappers, Express middleware,
  `@nestjs/cqrs`, `@cqrs-ddd/cqrs`, InversifyJS), not by ranking. InversifyJS is a DI
  container, not a competing bus.
- Wording never used: "exactly-once", "instant startup", "works in any runtime", "zero
  runtime dependencies" for the whole family (`@cqrs-ddd/pipeline` depends on
  `safe-stringify`, `untyped` and `uuidv7`), "10x cleaner", "production-proven", "faster
  than NestJS". Use "no framework or DI container required".
- `@cqrs-ddd/nestjs` is described as this project's NestJS adapter, with no wording that
  suggests endorsement by the NestJS maintainers.
- The first example is the review's plain-function one, on `@cqrs-ddd/pipeline`,
  `@cqrs-ddd/pipeline-zod` and `zod` (`integration/plain-node/create-order.mjs`). Rejected: the
  "15-line" example from the additional review, which imports `Command`, `withLogging` and
  `withValidation` (none exported) and calls `commandBus.register(Command, callback)` (not the
  registration API).
- The empty npm README is not a packaging defect. The registry has no README text for exactly
  the five packages that had versions before 0.5.0 (`core`, `mikro-orm`, `untyped`, `uuidv7`,
  `safe-stringify`). Inference, not reproduced: 0.5.0 went out with `--tag next` while `latest`
  was 0.4.2, and moving `latest` afterwards does not refresh the package-level README. The
  release steps in `README.md` now publish on the default tag.
- Owner, 2026-10-16: the launch texts are the owner's own. The agent writes no article, Show HN
  text, comment or reply, and does not rewrite the owner's texts; it supplies verified facts,
  checks and the tracker. A Show HN links the repository.
- Owner, 2026-10-16: launch material lives in `.claude/launch/`, git-ignored; the drafts were
  removed from the pull request branch by amending its commit (`f145753` → `d4ea1f0`).

## Modified Files

All committed on `promotion-readiness` (`d4ea1f0`); git holds the per-file detail:

- Steps 1 and 2: the idempotency, plain Node.js, CQRS, from-NestJS, getting-started,
  architecture and NestJS pages with their Greek mirrors; two package READMEs; one JSDoc
  comment; the three examples under `integration/` with their tests.
- Step 3: `.github/workflows/verify.yml`.
- Step 4: `README.md`, `index.mdx`, `overview.md` and their Greek mirrors.
- Step 5: keywords in eight manifests; the runtime table.
- 2026-10-16: `.gitignore` (`.claude/launch/`), `.claude/codebase-map.md` (regenerated), this
  file.
- Step 7, 2026-10-16: `docs/src/content/docs/guides/from-nestjs-pipeline.md` and its Greek
  mirror, a row in the README's "Choose a path", a link in both `guides/from-nestjs.md`;
  `.claude/codebase-map.md` regenerated (generated sections only).

## Tests and Verification

On 2026-10-13, after each step: `pnpm docs:build` with all internal links valid; `pnpm
lint:plugins` clean; `pnpm --filter ddd-cqrs-integration test` and `lint`; `pnpm verify:all`
on a clean copy under Node.js 24.13.0 and 22.17.0; `pnpm test:e2e` (33 files, 356 tests);
`pnpm test:release` (21 packed packages); the three examples as clean consumers of the
published 0.5.0 packages on Node.js 22.12.0 and 24.13.0; `pnpm context:validate` 58 passed.

On GitHub: run 38439812040 (2026-10-13) and the run on `d4ea1f0` (2026-10-16), all four jobs
pass.

On 2026-10-16, read-only: npm versions and weekly downloads; `gh repo view` and `gh pr view 1`;
`curl` of four documentation URLs; the channel rules, read from the pages by a fetch agent.

On 2026-10-16, the three first runs in clean directories outside the workspace, from the
published packages (`@cqrs-ddd/*` 0.5.0, zod 4.6.7, NestJS 12.1.3, `@nestjs/cqrs` 12.1.0), on
Node.js 24.13.0 and 22.12.0: all six exit 0 with the documented output. The NestJS run compiles
`integration/nestjs/invoices.ts` with a small entry that executes a valid and an invalid
command. Also: `pnpm lint:plugins` clean (896 files).

Not verified: the demo on StackBlitz; the `master` run that the badge reads.

## Risks

- Documentation of guarantees is a contract. Read the behavior source before rewording the
  idempotency and execution-order pages.
- English and Greek pages can drift; change both in the same commit.
- Manifest changes reach npm only through a release, and nestjs-pipeline installs these
  packages from 0.5.0.
- A CI job on a clean checkout may fail where local runs pass, because type checks and tests
  consume sibling `dist` output; build first.
- The declared minimum, Node.js 22.12.0, cannot run the repository's own tooling (pnpm 11.18.0
  needs 22.13; one spec needs `module.registerHooks` from 22.15). The `minimum-node` job works
  around both; the root README still lists "Node.js 22.12 or later" under Development.
- `verify:all` excludes Docker end-to-end. A single badge must not suggest otherwise.
- The first example prints a stack trace on standard error for the rejection it provokes; the
  pages say so, but a newcomer may read it as a crash.
- The licence is the likeliest first topic of a Hacker News thread: revenue-based fees and a
  contact requirement for the free tier.
- Little social proof (1 star, about a dozen weekly downloads): no launch outcome is promised.

## Open Questions

- **Blocking for step 5 and the launch:** does the project keep AGPL/commercial dual licensing
  as is, or move the core to a permissive license? The review expects the revenue-based terms
  and the contact requirement on the free tier to slow developer-led adoption, and recommends
  counsel review.
- Should the 0.5.0 documentation fixes go out as a README-only patch release, or wait for the
  next version? A patch on the default tag would also restore the five npm READMEs.
- With the Redis or PostgreSQL store, a crashed handler leaves a claim that refuses retries
  with `in_progress` for the whole `ttl`, 24 hours by default. Is that default intended, or should the in-progress claim get its own,
  shorter lifetime? That would be a package change, outside this task.
- Who are the three to five evaluators for step 7?
- Two package findings from the facts check, both package changes outside this task (code-path
  findings, not reproduced defects): the JSDoc of `IdempotencyBehavior` and
  `MemoryIdempotencyStore` calls the memory store the default, but the constructor requires a
  store (`packages/pipeline-idempotency/src/idempotency.behavior.ts:134,219-233`); and
  `IdempotencyConflictError` carries a `statusCode` (`errors/idempotency-conflict.error.ts:68`),
  against `AGENTS.md` rule 4. Fix them in a later release?

## Next Steps

Owner review of pull request 1, the Greek wording in particular; then merge. After the merge:
check the badge and the redeployed site, open the demo on StackBlitz, and publish a release on
the default tag. After the deploy, check that `guides/from-nestjs-pipeline/` answers 200 and
link it from the nestjs-pipeline README (its task, step 5).

## Snapshot Impact

None outstanding. The migration page changed only the generated counts of the map
(`pnpm context:update`, then `pnpm context:validate` 58 passed). The launch files are
git-ignored and do not change the map.

## Last Updated

2026-10-16
