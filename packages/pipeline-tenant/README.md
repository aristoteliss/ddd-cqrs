# @cqrs-ddd/pipeline-tenant

The current tenant of an execution, kept in `AsyncLocalStorage`: `runWithTenant(id, fn)`
sets it for everything `fn` calls, `currentTenantId()` reads it, and `tenantSource` hands
it to `createPipeline({ sources })` of `@cqrs-ddd/pipeline`, so every pipeline runs in the
tenant of the work that started it. No dependencies, no framework.

**Documentation:** [guide](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-tenant/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/cqrs-ddd/pipeline-tenant/) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-tenant
```

Requires Node.js 22.12 or later. Published as an ES module; a CommonJS application loads
it with `require()`.

## Example

```ts
import { currentTenantId, runWithTenant } from '@cqrs-ddd/pipeline-tenant';

await runWithTenant('acme', async () => {
  currentTenantId(); // 'acme'
});
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See `LICENSE` and
`COMMERCIAL_LICENSE.txt`.
