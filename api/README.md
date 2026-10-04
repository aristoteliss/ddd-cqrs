# ddd-cqrs-api

The example application of the `@cqrs-ddd/*` packages: users, roles and sessions served by
plain Express or Fastify routes, validated with Zod at the edge, run as commands and
queries on the `@cqrs-ddd/cqrs` buses through the pipeline behaviors, with the domain on
`@cqrs-ddd/core` and repositories on MikroORM.

**Documentation:** [the application in the HTTP guide](https://aristoteliss.github.io/ddd-cqrs/guides/http/#in-the-example-application) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

There is no framework container. `src/app.ts` builds every object with `new`, so each
dependency is visible in one file and checked by the compiler.

This is a demonstration, not a migration-compatibility target: its database history may be
reset whenever the sample schema changes.

## Setup

From the repository root, build the packages first; the application loads them from
their `dist/`:

```bash
pnpm install
pnpm build
cd api
pnpm db:migrate
pnpm start            # Express on port 3000
pnpm start:fastify    # Fastify; needs SESSION_SECRET
```

An `.env` file in `api/`, when present, is loaded before anything reads the environment.

| Command | Purpose |
| --- | --- |
| `pnpm db:migrate` | Apply pending migrations in every tenant |
| `pnpm db:revert` | Revert the last migration in every tenant (`--steps <n>` for more) |
| `pnpm permissions:rebuild` | Rebuild every user's materialized permission rules in every tenant, in batches of 500 users |
| `pnpm permissions:verify` | Print, per tenant, the users whose materialized rules differ from their source tables; exits non-zero on any drift |
| `pnpm sessions:purge` | Delete expired and long-revoked login sessions and their refresh-token history in every tenant |
| `pnpm openapi [path]` | Write the OpenAPI 3.1 document of the route table, generated from the routes' Zod schemas (default `dist/openapi.json`) |
| `pnpm test` | Build, then run the unit and integration specs |
| `pnpm test:e2e` | Run the end-to-end suites on both frameworks (needs Docker) |

The database commands build first and run `node dist/persistence/cli.js <command>`.

**Database setup order**: `pnpm db:migrate`, then `pnpm permissions:verify` must exit 0,
then start the application. On drift, run `pnpm permissions:rebuild` and verify again.

## How a request runs

```text
HTTP request (Express or Fastify)
  │
  ▼ requestContext: pino-http, correlation id, TenantSchemaMiddleware (x-tenant-schema)
  ▼ dispatch(route): sets the route on the HTTP span
  ▼ authenticate (Around hook): session cookie → Bearer JWT → x-api-id/x-api-key
  │   binds the principal in sessionPrincipalStore, the request's session and
  │   response in httpExchangeStore; 401 for a bad credential, before parsing
  ▼ the route's Zod schemas parse params, query, body (400 with fieldErrors)
  ▼ route.handle → commandBus / queryBus
  ▼ pipeline: logging, trace, metrics, attributes, Zod, dead letters, then the
  │   handler's own behaviors (CASL, feature flag, rate limit, idempotency, cache,
  │   audit, resilience)
  ▼ handler → domain aggregate → repository (MikroORM, repository cache)
  ▼ answer(error): package /http mappings, domainAnswer, HttpError, 500
```

| File | Role |
| --- | --- |
| `src/main.ts`, `src/bootstrap.ts` | Load `.env`, start tracing, build the application, listen, close on SIGTERM and SIGINT |
| `src/app.ts` | `createApp()`: the store, the queues and workers, the behaviors, the buses and every handler; `GLOBAL_BEHAVIORS` |
| `src/mount.ts` | What either framework mounts: the route table, the request context, the error answers, the authentication |
| `src/http/` | Routes as data, one `dispatch`, the Express and Fastify mounts, the error answer |
| `src/{users,roles,auths}/routes.ts` | The routes of each feature, each a command or query on the buses |
| `src/domain-answer.ts` | The HTTP answers of this application's own domain errors |
| `src/{users,roles,auths}/application/` | Commands, queries and handlers with their `@UsePipeline` declarations |
| `src/{users,roles,auths}/domain/` | Aggregates, events and domain errors |
| `src/{users,roles,auths}/persistence/`, `src/persistence/` | Repositories, the per-tenant store, entities, migration and CLI |

Unauthenticated requests are not refused by `authenticate`: they run without a principal,
and the CASL behavior of each handler answers 403. A credential that is present but
invalid, expired or issued for another tenant answers 401.

## Endpoints

Every request names its tenant in `x-tenant-schema`. Protected routes take a Bearer access
token, API-client headers, or, on Fastify, the `session` cookie.

| Prefix | Routes |
| --- | --- |
| `/users` | `GET /`, `GET /:id`, `GET /:id/overview`, `POST /`, `PATCH /:id`, `DELETE /:id` |
| `/roles` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` |
| `/auths` | `POST /login`, `POST /refresh`, `POST /logout` |

A write answers with what the caller may read afterwards; a caller who may write but not
read receives `{}` with the success status. `POST /users` and `POST /roles` take an
`Idempotency-Key` header (1–255 characters): a retry with the same key replays the first
result, the same key with another body answers `422 key_reuse`.

## Persistence

`src/persistence/persistence.config.ts` reads every persistence variable; the
application, the tenant middleware and the CLI all use its result.

- **libSQL** (`DB_ENGINE=libsql`, the default): one database per tenant. A single tenant
  uses `DATABASE_URL` unchanged. `SQLITE_TENANTS` adds tenants; local files take a tenant
  suffix, and several remote tenants need `SQLITE_DATABASE_TEMPLATE` containing
  `{tenant}`.
- **PostgreSQL** (`DB_ENGINE=postgres`): one schema per tenant. `TENANT_SCHEMAS` lists the
  schemas served and migrated; without it only `DB_DEFAULT_SCHEMA` is served. The
  migration history is kept per tenant schema.
- `DB_DEFAULT_SCHEMA` (default `tenant`) names exactly one schema. Tenant lists are split
  on commas and trimmed; an invalid name stops startup instead of falling back.

The initial migration creates `users`, `auth`, `auth_consumed_refresh_tokens`, `roles`,
`capabilities`, `role_capabilities`, `user_roles`, `user_additional_capabilities`,
`user_denied_capabilities`, `user_permission_rules` and the repository cache table, and
seeds 8 users, 5 roles and 14 capabilities whose names carry the tenant: in `tenant_a`,
Alice's email is `alice+tenant-a@seed.local`.

| User | Roles | Purpose |
| --- | --- | --- |
| Alice | `admin` | Unrestricted `all/manage` |
| Bob | `user-manager` | Department-scoped management with role-level denials |
| Carol | `self` | Self-read and username-only self-update |
| Dave | `viewer` | Read-only viewer |
| Eve | `viewer` + `self` | Multi-role ability merge |
| Frank | `support-agent` | Department-scoped support permissions |
| Grace | `user-manager` | A per-user denial overriding role permissions |
| Vince | `viewer` | A per-user additional grant (`User/create`) |

## Authentication

| Item | Contract |
| --- | --- |
| Access token | HS256 JWT (or verified with `JWT_PUBLIC_KEY`), lifetime `ACCESS_TOKEN_TTL_SECONDS` (default 300, 60–3600). Claims: `sub`, `sid`, `tenant`, `principalType: 'user'`, `iat`, `exp`, `jti`, plus `iss`/`aud` when configured. Verified without a session lookup. |
| Refresh token | 32 random bytes, base64url; only its SHA-256 digest is stored. The session lifetime `REFRESH_TOKEN_TTL_SECONDS` (default 14 days, minimum 3600) is fixed at login. |
| Transport | Only the `refresh_token` cookie: `HttpOnly; Secure; SameSite=Strict; Path=/auths`, on both frameworks. Never in a body. |
| Rotation | Every successful refresh sets a new refresh cookie; the presented token is recorded as consumed. |
| Grace window | The immediately previous token within `REFRESH_REUSE_GRACE_SECONDS` (default 30, 0–120) answers 200 for the same session, without rotating and without `Set-Cookie`. |
| Reuse detection | Any earlier token revokes the session: 401 `{ "code": "refresh_reused" }`. An unknown, expired or revoked token: 401 `{ "code": "refresh_invalid" }`. |
| Rate limit | Login per tenant and client address (20/min), refresh and logout per tenant and client address (60/min), user creation per principal (60/min); per process. Set `TRUST_PROXY` behind a load balancer. |
| Logout | Revokes the cookie's session, clears the cookies and answers 204, also for a missing or unknown cookie. An issued access token stays valid until it expires. |

| Route | Body | Answer |
| --- | --- | --- |
| `POST /auths/login` | `{ email, code }` | 200 `{ id, principalType, tenant, email, department, accessToken, accessTokenExpiresAt }` and the refresh cookie |
| `POST /auths/refresh` | none; reads the cookie | the same body; a new cookie only when the token rotated |
| `POST /auths/logout` | none; reads the cookie | 204, clears the cookies |

The demo accepts one shared login code for every user (`AUTH_LOGIN_CODE_SHA256`, or
`AUTH_LOGIN_CODE` outside production): anyone who knows it can sign in as any account. It
stands in for a per-user code or identity provider and is refused in production unless
`AUTH_SHARED_LOGIN_CODE=true`.

API clients are listed in `API_CLIENTS` as a JSON array of `{ id, key, tenants, rules }`;
`rules` are capability strings (`[!]subject|action[|conditions[|fields[|reason]]]`)
parsed at startup, and they are the client's complete authorization.

With `PERMISSIONS_IN_ACCESS_TOKEN=true`, login and refresh copy the user's materialized
rules into the access token as `perms`, with `department`, and the permission source then
answers without a query. A token that would exceed `ACCESS_TOKEN_MAX_BYTES` (default 2500)
is issued without them, and a warning names the user id and the rule count.

## Authorization

Authorization runs in two stages, both through `@cqrs-ddd/pipeline-casl`:

1. **Before the handler.** `@UsePipeline(requires({ action, subject }))` makes the CASL
   behavior load the caller through `CaslPermissionSource` and reject with 403 before any
   cache or idempotency behavior can answer.
2. **In the handler, after the authoritative load.** Commands call
   `authorizer.authorize(action, aggregate, fields)` before mutating; queries return read
   models built with `authorizer.project('read', entity, candidate)`, so a field the caller
   may not read is absent.

Human users' rules are materialized per user in `user_permission_rules` by
`UserPermissionsProjector`; the permission source reads them, with the user row, in one
round trip. A writer that changes role or capability assignments must rebuild the affected
users in the same transaction.

> [!WARNING]
> **Authorization & Cache Security Scope**: a query whose handler performs entity-level or
> field-level authorization must never share a cached response across principals. Build
> its key with `createPartitionedCacheKeyFactory` from `@cqrs-ddd/pipeline-cache`, which
> partitions the tenant, the principal and the permission scope and fails closed with
> `MissingCachePartitionError` when any of them is missing, never falling back to a
> shared value. A correlation id is not an isolation boundary. `GetUserOverviewHandler`
> caches only for callers whose read rules carry no conditions on the loaded entities.

## Background jobs

`UserCreatedEvent` enqueues the welcome-email job and `UserUpdatedEvent` the batch job, on
BullMQ queues that `createApp()` opens on `REDIS_HOST`/`REDIS_PORT`, with their workers.
`withJobContext` stamps each payload with the tenant, correlation id and principal of the
request, and `@InJobContext()` restores them on the worker. `SessionJobPrincipal`
re-checks the principal when the job runs: a user only while its session exists, belongs
to it, is not revoked or expired, and the user row exists; an API client only while
`API_CLIENTS` still lists it for the tenant. Failed commands and event handlers are
dead-lettered to the `dead-letters` queue, except the expected rejections listed in
`src/common/dead-letter/dead-letter.options.ts`.

## Tracing

`src/tracing.ts` starts the OpenTelemetry SDK before anything else loads and exports spans
over OTLP/gRPC to `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://localhost:4317`) under
`OTEL_SERVICE_NAME`. A request's trace holds the HTTP server span, named by the route
template (`GET /users/:id`) with `http.route` set by `dispatch`; one span per command,
query and event from the trace behavior, with the attributes of the behaviors that ran
(`feature_flag.*`, `cache.hit`, `idempotency.*`, `rate_limit.remaining_points`,
`dead_letter.captured`); and PostgreSQL query spans when the database is PostgreSQL.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `ADAPTER` | `express` (default) or `fastify` |
| `SESSION_SECRET` | Fastify only: 64 hex characters (32 bytes) for the encrypted `session` cookie |
| `TRUST_PROXY` | Unset: off. Otherwise Express `trust proxy` / Fastify `trustProxy` |
| `DB_ENGINE`, `DB_DEFAULT_SCHEMA`, `DATABASE_URL`, `SQLITE_TENANTS`, `SQLITE_DATABASE_TEMPLATE`, `AUTH_TOKEN` | libSQL persistence; `AUTH_TOKEN` authenticates a remote libSQL server |
| `TENANT_SCHEMAS`, `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` | PostgreSQL persistence |
| `REDIS_HOST`, `REDIS_PORT` | The BullMQ queues and dead letters, and the pipeline response cache when set or in production |
| `JWT_SECRET`, `JWT_PUBLIC_KEY`, `JWT_PUBLIC_KEY_ALG`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_ALGORITHMS` | Access-token signing and verification; one of `JWT_SECRET` and `JWT_PUBLIC_KEY` is needed for Bearer tokens |
| `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `REFRESH_REUSE_GRACE_SECONDS` | Session lifetimes |
| `PERMISSIONS_IN_ACCESS_TOKEN`, `ACCESS_TOKEN_MAX_BYTES` | Rules carried in the access token |
| `AUTH_LOGIN_CODE_SHA256`, `AUTH_LOGIN_CODE`, `AUTH_SHARED_LOGIN_CODE` | The shared demo login code |
| `API_CLIENTS` | Machine clients, as described under Authentication |
| `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT` | Trace export |
| `NODE_ENV` | `production` quiets logs and enforces the production checks |

## Tests

| Suite | Where | Command |
| --- | --- | --- |
| Unit and integration, with coverage | `src/**/*.spec.ts`, `test/**/*.spec.ts` | `pnpm test` |
| End to end | `test/**/*.e2e-spec.ts` | `pnpm test:e2e` |

The end-to-end suites start the real application on Express and on Fastify against
throwaway libSQL databases and a Redis container (Testcontainers), and drive it with
supertest. A request carrying `x-test-user` authenticates through a test session, so it
still runs the real authentication and authorization. The PostgreSQL suites start their
own PostgreSQL container. They need a running Docker-compatible runtime; an
infrastructure failure fails the suite instead of skipping it.

These suites test the application. Checks of the packages alone, or of several packages
composed without application code, are in `integration/`.

