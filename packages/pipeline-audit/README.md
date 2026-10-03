# @cqrs-ddd/pipeline-audit

Audit records for `@cqrs-ddd/pipeline`: for each audited operation, who did what, in
which tenant and correlation, with which outcome, and with request and response payloads
redacted. `LogAuditSink` writes to a logger (`console` by default) and
`PostgresAuditSink` to a table; any `AuditSink` with `write()` works.

**Documentation:** [guide](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-audit/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/cqrs-ddd/pipeline-audit/) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-audit @cqrs-ddd/pipeline
```

Requires Node.js 22.12 or later. Published as an ES module; a CommonJS application loads
it with `require()`.

## Example

```ts
const pipeline = createPipeline({
  behaviors: [new AuditBehavior(new LogAuditSink())],
});

export const renameUser = pipeline.wrap(
  { name: 'renameUser', kind: 'command' },
  audit({ action: 'user.rename', severity: 'high', actor: (c) => ({ id: currentUserId(c) }) }),
)(async (input: { id: string; name: string }) => users.rename(input));
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See `LICENSE` and
`COMMERCIAL_LICENSE.txt`.
