---
title: Background jobs
description: Enqueue jobs from handlers and run them in the tenant, correlation id and principal of the request that enqueued them, and run scheduled work as a declared service principal.
sidebar:
  order: 10
---

A job runs later, in another process or tick, without the request that enqueued it.
[`@cqrs-ddd/pipeline-job-context`](/ddd-cqrs/packages/pipeline-job-context/) stamps the
request's tenant, correlation id and principal into the job payload, and restores them
when the job runs, so the job's pipelines, keys and authorization behave as the request's
did. This guide uses BullMQ; any queue that carries a JSON payload works the same way.

## The principal

The application tells the package how to read its current principal and how to run work
as a principal again, by implementing `IJobPrincipal` over its own authentication state:

```ts
import type { IJobPrincipal, PrincipalReference } from '@cqrs-ddd/pipeline-job-context';

export class SessionJobPrincipal implements IJobPrincipal {
  constructor(private readonly sessions: Sessions) {}

  capture(): PrincipalReference | undefined {
    const principal = sessionPrincipalStore.getStore();
    return principal && { id: principal.id, type: principal.type, sessionId: principal.sid };
  }

  async restore<T>(principal: PrincipalReference, work: () => Promise<T>): Promise<T> {
    const current = await this.sessions.findActive(principal);
    if (!current) throw new Error(`The session of ${principal.id} is no longer active.`);
    return sessionPrincipalStore.run(current, work);
  }
}
```

The payload keeps only `id`, `type` and `sessionId`, never permissions: `restore()` loads
the principal again, so a revoked session or a deleted user refuses the job.

## Registering the job context

`registerJobContext()`, once when the application starts, registers the principal, the
tenants a job may run in, and where the tenant and correlation id live. It returns the
function that removes the registration, for shutdown:

```ts
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { registerJobContext } from '@cqrs-ddd/pipeline-job-context';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

const unregister = registerJobContext({
  principal: new SessionJobPrincipal(sessions),
  tenants: config.tenants,
  sources: { tenantId: tenantSource, correlationId: correlationSource },
});
```

## Enqueueing from an event handler

`withJobContext(data)` adds the current context to the payload. It throws
`MissingJobContextError` outside a tenant or without a principal, so a job is never
enqueued without the context it must run in:

```ts
import { withJobContext } from '@cqrs-ddd/pipeline-job-context';
import { Queue } from 'bullmq';

@EventsHandler(UserCreatedEvent)
export class EnqueueWelcomeEmail implements IEventHandler<UserCreatedEvent> {
  constructor(private readonly queue: Queue) {}

  async handle(event: UserCreatedEvent): Promise<void> {
    await this.queue.add('welcome', withJobContext({ userId: event.userId }));
  }
}
```

The event handler runs inside the command's correlation id and tenant, so the job carries
them.

## Running the job

`@InJobContext()` on the worker's method restores the context from `job.data.jobContext`
before the method runs: the tenant, the correlation id, and the principal through
`restore()`. A command the job executes then runs its pipeline as the request's would. The
application starts the worker and closes it on shutdown:

```ts
import { InJobContext, type WithJobContext } from '@cqrs-ddd/pipeline-job-context';
import { Worker, type Job } from 'bullmq';

export class WelcomeEmailWorker {
  private readonly worker: Worker;

  constructor(private readonly commands: CommandBus) {
    this.worker = new Worker('welcome', (job) => this.process(job), { connection });
  }

  close() {
    return this.worker.close();
  }

  @InJobContext()
  async process(job: Job<WithJobContext<{ userId: string }>>) {
    await this.commands.execute(new SendWelcomeEmailCommand(job.data.userId));
  }
}
```

A payload without a valid context, or one that names a tenant outside `tenants`, throws
`InvalidJobContextError` and the job fails without running.

## Scheduled work

Work that no request started, such as a nightly cleanup, has no principal to restore.
`@AsSystem()` runs it as a declared service principal with the grants its code declares,
once per registered tenant, each run with its own tenant and a new correlation id:

```ts
import { AsSystem } from '@cqrs-ddd/pipeline-job-context';

export class SessionCleanup {
  constructor(private readonly commands: CommandBus) {}

  @AsSystem({
    principal: { id: 'session-cleanup', type: 'service' },
    grants: [{ action: 'delete', subject: 'Auth' }],
  })
  async purgeExpired() {
    await this.commands.execute(new PurgeExpiredSessionsCommand());
  }
}
```

`restore()` receives the declared grants as its third argument for this work. A failing
tenant does not stop the others; the method then rejects with an `AggregateError`. Place
`@AsSystem` under the scheduling decorator, so the schedule calls the wrapped method.
