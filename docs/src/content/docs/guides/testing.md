---
title: Testing handlers
description: Test a handler on its own, then the whole application with its pipelines and event handlers, using in-memory doubles.
sidebar:
  order: 11
---

A handler is a plain class, and an application is a function that builds its handlers with
`new`, so tests need no testing module: construct the handler for a unit test, and build
the application with doubles for a test of its wiring.

## A handler on its own

A test calls the constructor directly. No pipeline runs: the test covers the handler's own
logic.

```ts
it('adds the user and publishes UserCreatedEvent', async () => {
  const users = new MemoryUsers();
  const published: unknown[] = [];
  const handler = new CreateUserHandler(users, {
    publish: (event) => void published.push(event),
  } as EventBus);

  const id = await handler.execute(new CreateUserCommand('req-1', 'Ann'));

  expect(users.find(id)).toEqual({ id, name: 'Ann' });
  expect(published).toEqual([expect.any(UserCreatedEvent)]);
});
```

## The application with doubles

The function that builds the application takes the ports it needs, and a test passes
doubles:

```ts
export function createApp(ports: { users: Users; mailer: Mailer; auditSink: AuditSink }) {
  const cqrs = createCqrs({
    behaviors: [
      new IdempotencyBehavior(new MemoryIdempotencyStore()),
      new AuditBehavior(ports.auditSink),
    ],
    globalBehaviors: { before: [LoggingBehavior] },
  });
  cqrs.register(
    new CreateUserHandler(ports.users, cqrs.eventBus),
    new SendWelcomeMail(ports.mailer),
  );
  return cqrs;
}
```

```ts
it('creates a user once per request id, audits it and sends one welcome mail', async () => {
  const mails: string[] = [];
  const audits: AuditRecord[] = [];
  const app = createApp({
    users: new MemoryUsers(),
    mailer: { send: async (to) => void mails.push(to) },
    auditSink: { write: (record) => void audits.push(record) },
  });

  const first = await app.commandBus.execute(new CreateUserCommand('req-1', 'Ann'));
  const again = await app.commandBus.execute(new CreateUserCommand('req-1', 'Ann'));
  await app.close();

  expect(again).toBe(first);
  expect(mails).toEqual([first]);
  expect(audits).toHaveLength(1);
});
```

`close()` waits for the event handlers still running, so assertions after it see what
they did; here the welcome mail.

Building the application is itself a test of the configuration: `register()` fails on a
second handler for one command, an undecorated class, or a behavior contract violation
(`diagnostics: 'strict'`, the default), and `createCqrs()` on a global behavior that cannot
be built.

## Tenant and principal

Behaviors that partition their keys by tenant or check a principal fail closed outside a
request. A test runs the call inside the context a request would set:

```ts
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';

await runWithTenant('acme', () => app.commandBus.execute(new CreateUserCommand('req-1', 'Ann')));
```

A principal is set the same way, through the application's own `AsyncLocalStorage`
store that its CASL permission source reads.

## Quiet logs

`LoggingBehavior`, failed event handlers and the startup lines write to the `logger` of
`createCqrs()`, `console` by default. A test passes a silent one, or one that records lines
to assert on:

```ts
createCqrs({
  globalBehaviors: { before: [LoggingBehavior] },
  logger: { log() {}, warn() {}, error() {} },
  bootstrapLogLevel: 'none',
});
```

## A behavior on its own

A behavior is a plain class too: a pipeline runs it around a function, with no buses.

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';

const sink = { write: vi.fn() };
const rename = createPipeline({ behaviors: [new AuditBehavior(sink)] }).wrap(
  { name: 'renameUser', kind: 'command' },
  AuditBehavior,
)(async (name: string) => name);

await rename('Ann');
expect(sink.write).toHaveBeenCalledOnce();
```
