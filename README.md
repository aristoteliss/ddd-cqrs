# ddd-cqrs

Packages of the `@cqrs-ddd` organization: Domain-Driven Design primitives, small
dependency-free utilities, pipeline behaviors (validation, authorization, caching,
idempotency, rate limiting, resilience, audit, dead letters, feature flags,
telemetry), framework-free CQRS buses ([`@cqrs-ddd/cqrs`](https://aristoteliss.github.io/ddd-cqrs/packages/cqrs/)),
and the official NestJS adapter ([`@cqrs-ddd/nestjs`](https://aristoteliss.github.io/ddd-cqrs/packages/nestjs/))
that glues the pipeline and DDD ecosystem with `@nestjs/cqrs`. Every core package runs
without a framework or a dependency-injection container.

**Documentation:** [site](https://aristoteliss.github.io/ddd-cqrs/) · [getting started](https://aristoteliss.github.io/ddd-cqrs/getting-started/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/)

## Repository layout

| Path | Holds |
| --- | --- |
| `packages/` | The published `@cqrs-ddd/*` packages, each with its own README |
| `api/` | The example application: users, roles and sessions on every package together |
| `integration/` | Repository-wide checks, and small applications that use one package family at a time (see its README) |
| `docs/` | The documentation site |
| `biome/plugins/` | The Grit plugins that guard the package boundaries |
| `scripts/` | Generator and validator of the agent context files |
| `tools/local-registry/` | A local npm registry in Docker, to install the packages elsewhere before they are published |

## Development

Requirements: Node.js 22.12 or later, pnpm 9 or later, and Bun on `PATH` for the release
check.

```bash
pnpm install
pnpm verify:all   # lint, tests, build, release check
```

`AGENTS.md` holds the repository rules every contributor follows.

### Releasing

Every package is released in lockstep, at one version.

1. Try the packages where they are used before publishing: publish them to the local
   registry (`tools/local-registry/`, whose README holds the commands) and install them
   there, in nestjs-pipeline's `api` for example.
2. On a clean, up-to-date `master`: `pnpm install --frozen-lockfile`, `pnpm verify:all`,
   `npm whoami`, then `pnpm publish:all --tag next`. It copies the license files and
   publishes every package; each rebuilds in `prepublishOnly`, and `pnpm publish` skips a
   version already on the registry.
3. Once the release is confirmed, move `latest` to it for every package that `--tag next`
   left on an older version:
   `npm dist-tag add @cqrs-ddd/<name>@<version> latest`.
4. Tag each package as `<name>@<version>` and the release as `v<version>`, then push the
   tags; pushing `master` redeploys the documentation site.
5. Projects that tried the local registry re-resolve the packages from npm
   (`pnpm update "@cqrs-ddd/*"`): a rebuilt tarball has a different integrity hash.

## License and Commercial Use

This software is **Dual-Licensed**.

By default, this project is licensed under the **GNU AGPLv3** (see the `LICENSE` file). You can use, modify, and distribute it freely, provided your entire application is also open-sourced under the AGPLv3.

**Commercial License (No AGPL Restrictions)**

If you are using this software commercially and cannot (or do not want to) open-source your application under the AGPLv3, you must use the **Commercial License** (see `COMMERCIAL_LICENSE.txt`).
