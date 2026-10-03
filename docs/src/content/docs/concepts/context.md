---
title: The pipeline context
description: What a behavior can read and write during one execution, and where the tenant and correlation id come from.
sidebar:
  order: 3
---

Each call of a wrapped operation creates one context, which every behavior of the chain
receives:

| Field | Value |
| --- | --- |
| `request` | the argument, or the argument array; see [How an operation is wrapped](/ddd-cqrs/concepts/wrapping/) |
| `requestName`, `handlerName` | the names of the operation |
| `requestKind` | `'command'`, `'query'` or `'event'` |
| `correlationId` | the id that ties this execution to the work that caused it |
| `tenantId` | the tenant of this execution, if any |
| `startedAt` | when the execution started |
| `response` | the result, once the function has returned |
| `items` | a map that behaviors use to hand values to one another |
| `getBehaviorOptions(Behavior)` | the merged options of that behavior for this operation |

## Items

Behaviors share values through `context.items`. A typed token keeps the key unique and
the value typed:

```ts
import {
  createPipelineItem,
  getPipelineItem,
  requirePipelineItem,
  setPipelineItem,
} from '@cqrs-ddd/pipeline';

export const CURRENT_USER = createPipelineItem<string>('currentUser');

// An authentication behavior sets it ...
setPipelineItem(context, CURRENT_USER, userId);

// ... and a later behavior reads it.
const userId = getPipelineItem(context, CURRENT_USER);
const required = requirePipelineItem(context, CURRENT_USER);
```

`requirePipelineItem` throws `MissingPipelineItemError` when the value is absent. The
behavior packages export their own tokens, such as the cache key or the idempotency
decision, so a later behavior can read what an earlier one decided.

## Tenant and correlation id

`createPipeline({ sources })` says where an execution takes its tenant and correlation id
from:

```ts
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

const pipeline = createPipeline({
  sources: { tenantId: tenantSource, correlationId: correlationSource },
});
```

When an execution starts:

- the tenant is the source's current value; without a source, it is the tenant of the
  enclosing pipeline, if any;
- the correlation id is the source's current value, or a new one from the source; without
  a source, it is that of the enclosing pipeline, or a new UUIDv7.

The chain then runs inside these values, so everything it calls, including nested
pipelines and the source's own readers such as `currentTenantId()`, sees them. Behaviors
that partition their keys by tenant, such as the cache, idempotency and rate limits, fail
closed when they need a tenant and the execution has none.
