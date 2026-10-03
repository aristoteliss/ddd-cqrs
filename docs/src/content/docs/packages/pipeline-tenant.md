---
title: "@cqrs-ddd/pipeline-tenant"
description: "The current tenant of an execution, kept in AsyncLocalStorage and handed to pipelines as a context source."
sidebar:
  order: 30
---

Keeps the current tenant of an execution in `AsyncLocalStorage`. `runWithTenant(id, fn)`
sets it for everything `fn` calls, synchronously or asynchronously; `currentTenantId()`
reads it; and `tenantSource` hands it to a pipeline, so every pipeline runs in the tenant of
the work that started it. The package has no dependencies.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-tenant
```

## Usage

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import { currentTenantId, runWithTenant, tenantSource } from '@cqrs-ddd/pipeline-tenant';

const pipeline = createPipeline({ sources: { tenantId: tenantSource } });

const listOrders = pipeline.wrap({ name: 'listOrders', kind: 'query' })(async () =>
  orders.findByTenant(currentTenantId()),
);

await runWithTenant('acme', () => listOrders());
```

An HTTP middleware or a queue consumer sets the tenant once, at the edge:

```ts
app.use((req, res, next) => runWithTenant(req.auth.tenantId, next));
```

## Semantics

- `runWithTenant(tenantId, fn)` returns what `fn` returns. A nested call replaces the
  tenant for its own callback only; `undefined` runs `fn` with no tenant.
- `currentTenantId()` returns the tenant of the innermost `runWithTenant` call or running
  pipeline, or `undefined` outside both.
- Inside a pipeline, `context.tenantId` is the tenant the execution took from the source
  when it started.

The cache, idempotency and rate-limit behaviors partition their keys by this tenant and
fail closed when they need one and the execution has none. See
[The pipeline context](/ddd-cqrs/concepts/context/).

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-tenant/)
