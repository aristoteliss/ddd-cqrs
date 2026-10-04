---
title: "@cqrs-ddd/pipeline-casl"
description: "CASL authorization: type-level checks before an operation runs, and entity and field checks inside it."
sidebar:
  order: 11
---

Fine-grained attribute- and role-based authorization using [CASL](https://casl.js.org). 

Enforces a two-tier defense-in-depth model:
1. **Type-Level Authorization (Outer Gate)**: `CaslBehavior` evaluates static permissions before operations execute (e.g. *Can this user execute `DeleteUserCommand`?*), avoiding unnecessary database lookups.
2. **Entity & Field Authorization (Inner Gate)**: `CaslAuthorizer` evaluates fine-grained rules on hydrated domain aggregates inside the handler (e.g. *Can this user update this specific article when `authorId !== currentUserId`?*) and projects readable fields.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-casl @cqrs-ddd/pipeline @casl/ability
```

Requires Node.js 22.12 or later and `@casl/ability` 7.

## Architecture & Two-Tier Authorization Flow

```text
Incoming Request
      │
      ▼
[1. Type-Level Gate: CaslBehavior]
      ├─ Resolves caller principal & rules via ICaslPermissionSource
      ├─ Evaluates type-level rules declared by requires({ action, subject })
      ├─ Denied? ──► Throws UnauthorizedActionException (HTTP 403)
      └─ Allowed ──► Stashes Ability & Principal in IPipelineContext
                           │
                           ▼
[2. Handler Execution]
      ├─ Loads domain aggregate from repository (e.g. post = await repo.findById(id))
      ├─ Instantiates CaslAuthorizer (reads Ability from context)
      ├─ Evaluates authorizer.authorize('update', post, ['title'])
      ├─ Modifies aggregate via domain methods
      ├─ Saves aggregate
      └─ Returns projected fields: authorizer.project('read', post, dto)
```

## Quick Example

```typescript
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  CaslBehavior,
  type ICaslPermissionSource,
  parseCapabilityString,
  requires,
} from '@cqrs-ddd/pipeline-casl';

// 1. Implement permission source
const permissionSource: ICaslPermissionSource = {
  load: async (context) => {
    const session = await authService.getCurrentSession();
    if (!session) return null; // Unauthenticated requests are denied

    return {
      principal: { id: session.userId, tenantId: session.tenantId, role: session.role },
      rules: session.capabilities.map(parseCapabilityString),
    };
  },
};

// 2. Configure pipeline
const pipeline = createPipeline({
  behaviors: [new CaslBehavior(permissionSource)],
  globalBehaviors: { before: [CaslBehavior] },
});

// 3. Declare type-level requirement
export const deleteUser = pipeline.wrap(
  { name: 'deleteUser', kind: 'command' },
  requires({ action: 'delete', subject: 'User' }),
)(async (userId: string) => usersRepo.delete(userId));
```

## Capability Format & Condition Interpolation

The permission source loads rules as `Capability` objects. For compact database storage or JWT claims, serialize them as capability strings:

```text
Subject|action|conditions|fields
```

### Capability Examples

| Capability String | Action | Subject | Conditions / Fields | Meaning |
| --- | --- | --- | --- | --- |
| `Post\|read\|*` | `read` | `Post` | Wildcard | Can read any post |
| `!Post\|delete\|*` | `delete` | `Post` | Inverted (`!`) | Explicitly forbidden to delete posts |
| `Post\|update\|{"authorId":"${user.id}"}\|title,body` | `update` | `Post` | `${user.id}` match | Can only update title and body on own posts |
| `all\|manage\|*` | `manage` | `all` | Wildcard | Superadmin: can perform any action |

### Dynamic Condition Interpolation

Placeholders matching `${user.<field>}` in conditions are automatically interpolated against attributes of the active `principal`:

```typescript
// Rule: {"tenantId":"${user.tenantId}","department":"${user.dept}"}
// Principal: { id: 'u_1', tenantId: 'org_abc', dept: 'engineering' }
// Interpolated condition: { tenantId: 'org_abc', department: 'engineering' }
```

## Entity and Field Checks (`CaslAuthorizer`)

Inside command or query handlers, instantiate `CaslAuthorizer` to evaluate rules against hydrated entities and sanitize output fields:

```typescript
import { CaslAuthorizer } from '@cqrs-ddd/pipeline-casl';

export class UpdateArticleHandler {
  async execute(command: UpdateArticleCommand) {
    const authorizer = new CaslAuthorizer(); // Automatically reads Ability from running context
    const article = await this.articles.findById(command.articleId);

    // 1. Authorize action and modified fields on the aggregate:
    authorizer.authorize('update', article, ['title', 'content']);

    // 2. Perform domain mutation:
    article.updateContent(command.title, command.content);
    await this.articles.save(article);

    // 3. Project only fields the caller is authorized to read:
    return authorizer.project('read', article, {
      id: article.id,
      title: article.title,
      content: article.content,
      internalNotes: article.internalNotes, // Stripped if caller lacks permission
    });
  }
}
```

`authorizer.authorize()` throws `UnauthorizedActionException` if the check fails. `authorizer.can(action, subject)` returns a boolean for non-throwing conditional logic.

## Security & Cache Partitioning (`abilityDigest`)

When caching query results (`@cqrs-ddd/pipeline-cache`) or replaying idempotent commands (`@cqrs-ddd/pipeline-idempotency`), responses must never be replayed across different permission tiers.

`abilityDigest(context)` generates a SHA-256 fingerprint of the caller's rules:

```typescript
import { createPartitionedCacheKeyFactory } from '@cqrs-ddd/pipeline-cache';
import { abilityDigest, getCaslPrincipal } from '@cqrs-ddd/pipeline-casl';

const userCacheKey = createPartitionedCacheKeyFactory({
  principal: (ctx) => getCaslPrincipal(ctx)?.id,
  scope: abilityDigest, // Binds cache entries to caller permission fingerprint
});
```

If a user's permissions change, subsequent requests generate a different cache key, preventing unauthorized cache hits.

## NestJS Integration (`@cqrs-ddd/nestjs`)

Provide `CaslBehavior` in a shared security module:

```typescript
import { Module } from '@nestjs/common';
import { CaslBehavior } from '@cqrs-ddd/pipeline-casl';
import { AuthService } from '../auth/auth.service.js';

@Module({
  providers: [
    {
      provide: CaslBehavior,
      inject: [AuthService],
      useFactory: (auth: AuthService) => new CaslBehavior(auth.permissionSource),
    },
  ],
  exports: [CaslBehavior],
})
export class SecurityModule {}
```

Decorate `@CommandHandler` or `@QueryHandler` with `requires`:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { requires } from '@cqrs-ddd/pipeline-casl';

@CommandHandler(DeleteArticleCommand)
@UsePipeline(requires({ action: 'delete', subject: 'Article' }))
export class DeleteArticleHandler implements ICommandHandler<DeleteArticleCommand> {
  async execute(command: DeleteArticleCommand) {
    // Type-level authorization passed
  }
}
```

The global `ErrorFilter` automatically translates `UnauthorizedActionException` into HTTP 403 Forbidden with details:

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Access denied: cannot execute \"delete\" on \"Article\".",
  "action": "delete",
  "subject": "Article"
}
```

## Behavior Ordering

Position `CaslBehavior` **before** cache and idempotency behaviors in the pipeline:
1. `ZodValidationBehavior`: Sanitizes input.
2. `CaslBehavior`: Verifies authorization before any business logic or caching.
3. `CacheBehavior` / `IdempotencyBehavior`: Evaluates short-circuit keys using `abilityDigest`.

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-casl/)
