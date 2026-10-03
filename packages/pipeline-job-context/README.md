# @cqrs-ddd/pipeline-job-context

Carries the tenant, correlation id and principal of a request into the queue jobs it
enqueues, and gives system-started work an explicit context: `registerJobContext()` once
at startup, `withJobContext()` when a job is enqueued, `@InJobContext()` on the consumer
and `@AsSystem()` on system work (both TypeScript decorator modes). No framework.

**Documentation:** [guide](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-job-context/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/cqrs-ddd/pipeline-job-context/) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-job-context
```

Requires Node.js 22.12 or later. Published as an ES module; a CommonJS application loads
it with `require()`.

## Example

```ts
registerJobContext({
  principal: new SessionJobPrincipal(sessions),
  tenants: ['acme'],
  sources: { tenantId: tenantSource, correlationId: correlationSource },
});

await queue.add('welcome', withJobContext({ userId }));

class WelcomeWorker {
  @InJobContext()
  async process(job: { data: { userId: string } }) {}
}
```

A queue payload is untrusted data: it carries only the principal's identity, and the
principal is re-checked when the job runs.

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See `LICENSE` and
`COMMERCIAL_LICENSE.txt`.
