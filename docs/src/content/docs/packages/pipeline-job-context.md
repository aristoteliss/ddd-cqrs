---
title: "@cqrs-ddd/pipeline-job-context"
description: "Carry the tenant, correlation id and principal of a request into the queue jobs it enqueues, and give system work an explicit context."
sidebar:
  order: 32
---

Background work loses the context of the request that started it. This package carries
the tenant, the correlation id and the principal of a request into the queue jobs it
enqueues, and restores them when the job runs. Work that no request started, such as a cron
job, declares its own context: a service principal, its grants, and the tenants it runs in.

- `registerJobContext()`, once at startup, configures where the context comes from;
- `withJobContext(data)` stamps a job payload when it is enqueued;
- `@InJobContext()` restores the context on the consumer method;
- `@AsSystem()` runs system work once per tenant as a declared service principal.

Both decorators work in the standard and the `experimentalDecorators` mode.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-job-context
```

## Usage

```ts
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import {
  InJobContext,
  registerJobContext,
  withJobContext,
} from '@cqrs-ddd/pipeline-job-context';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

registerJobContext({
  principal: new SessionJobPrincipal(sessions),
  tenants: ['acme', 'globex'],
  sources: { tenantId: tenantSource, correlationId: correlationSource },
});

// When the job is enqueued, inside the request:
await queue.add('welcome', withJobContext({ userId }));

// When the job runs:
class WelcomeWorker {
  @InJobContext()
  async process(job: { data: { userId: string } }) {}
}
```

`SessionJobPrincipal` stands for the application's implementation of `IJobPrincipal`.

### NestJS Integration (`@cqrs-ddd/nestjs`)

In NestJS applications, use `JobContextModule.forRoot()` from `@cqrs-ddd/nestjs/job-context` to register context at module startup and clean it up on application shutdown:

```typescript
import { Module } from '@nestjs/common';
import { JobContextModule } from '@cqrs-ddd/nestjs/job-context';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';
import { SessionJobPrincipal } from './session-job-principal.service.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    JobContextModule.forRoot({
      imports: [AuthModule],
      principal: SessionJobPrincipal,
      tenants: () => ['tenant_a', 'tenant_b'],
      sources: { tenantId: tenantSource, correlationId: correlationSource },
    }),
  ],
})
export class AppModule {}
```

## Options

`registerJobContext(options)`:

| Option | Meaning |
| --- | --- |
| `principal` | the application's `IJobPrincipal`: `capture()` reads the current principal when a job is enqueued; `restore(principal, work, grants?)` re-checks it and runs the job as that principal |
| `tenants` | the tenants a job may run in; a job that names another is refused |
| `sources` | where the tenant and the correlation id are read from and restored into, such as `tenantSource` and `correlationSource` |

`@InJobContext({ path })` reads the context at a dot path of the method's first argument,
`'data.jobContext'` by default (a BullMQ job).

## System work

```ts
import { AsSystem } from '@cqrs-ddd/pipeline-job-context';

class Maintenance {
  @AsSystem({
    principal: { id: 'session-cleanup', type: 'service' },
    grants: [{ action: 'delete', subject: 'Auth' }],
  })
  async purgeSessions() {
    await purgeExpiredSessions();
  }
}
```

The method runs once per registered tenant, one after another, each run with its own tenant,
a new correlation id, and the declared principal and grants. A failing tenant does not stop
the others; the method then rejects with an `AggregateError`. Place `@AsSystem` under the
scheduling decorator.

## Security

A queue payload is untrusted data. It carries only the principal's identity (`id`, `type`,
`sessionId`), never its permissions, and `restore()` re-checks the principal when the job
runs: a revoked session or a deleted principal refuses the job. System work takes its
grants only from its declaration, never from data.

`withJobContext()` throws `MissingJobContextError` without a registration, a current tenant
or a current principal; `@InJobContext()` throws `InvalidJobContextError` for a malformed
or foreign context.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-job-context/)
