# ddd-cqrs

Framework-neutral packages of the `@cqrs-ddd` organization: Domain-Driven Design
primitives, small dependency-free utilities, and pipeline behaviors (validation,
authorization, caching, idempotency, rate limiting, resilience, audit, dead letters,
feature flags, telemetry). Every package runs in a plain Node.js application, without a
framework or a dependency-injection container.

**Documentation:** [site](https://aristoteliss.github.io/ddd-cqrs/) · [getting started](https://aristoteliss.github.io/ddd-cqrs/getting-started/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/)

## Repository layout

| Path | Holds |
| --- | --- |
| `packages/` | The published packages, each with its own README |
| `api/` | The example application: users, roles and sessions on every package together |
| `integration/` | Repository-wide checks, and small applications that use one package family at a time (see its README) |
| `docs/` | The documentation site |
| `biome/plugins/` | The Grit plugins that guard the package boundaries |
| `scripts/` | Generator and validator of the agent context files |

## Development

Requirements: Node.js 22.12 or later, pnpm 9 or later, and Bun on `PATH` for the release
check.

```bash
pnpm install
pnpm verify:all   # lint, tests, build, release check
```

`AGENTS.md` holds the repository rules every contributor follows.

## License and Commercial Use

This software is **Dual-Licensed**.

By default, this project is licensed under the **GNU AGPLv3** (see the `LICENSE` file). You can use, modify, and distribute it freely, provided your entire application is also open-sourced under the AGPLv3.

**Commercial License (No AGPL Restrictions)**

If you are using this software commercially and cannot (or do not want to) open-source your application under the AGPLv3, you must use the **Commercial License** (see `COMMERCIAL_LICENSE.txt`).
