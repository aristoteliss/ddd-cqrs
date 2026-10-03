---
title: "@cqrs-ddd/pipeline-casl"
description: "CASL authorization: type-level checks before an operation runs, and entity and field checks inside it."
sidebar:
  order: 11
---

Authorization with [CASL](https://casl.js.org). It works at two levels:

- `CaslBehavior` checks **type-level** requirements before the operation runs, such as
  "may this caller delete posts?", declared with `requires({ action, subject })`.
- `CaslAuthorizer` checks the **loaded entity** inside the operation, such as "may this
  caller update this post's title?", and projects the fields the caller may read.

The behavior loads the caller and their rules through an `ICaslPermissionSource` that the
application implements.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-casl @cqrs-ddd/pipeline @casl/ability
```

## Usage

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  CaslBehavior,
  type ICaslPermissionSource,
  parseCapabilityString,
  requires,
} from '@cqrs-ddd/pipeline-casl';

const permissions: ICaslPermissionSource = {
  load: async (context) => {
    const user = await sessions.current();
    if (!user) return null; // unauthenticated: denied
    return {
      principal: { id: user.id },
      rules: user.capabilities.map(parseCapabilityString),
    };
  },
};

const pipeline = createPipeline({
  behaviors: [new CaslBehavior(permissions)],
  globalBehaviors: { before: [CaslBehavior] },
});

export const deletePost = pipeline.wrap(
  { name: 'deletePost', kind: 'command' },
  requires({ action: 'delete', subject: 'Post' }),
)(async (id: string) => posts.remove(id));
```

`requires()` takes one or more requirements, `{ action, subject, field? }`; all of them
must pass. An operation without requirements runs without loading permissions.

## Rules

`load()` returns the principal and its rules, as `Capability` objects (`subject`,
`action`, and optionally `conditions`, `fields` and `inverted`). A capability string,
`Subject|action|conditions|fields`, is their compact form for storage;
`parseCapabilityString()` and `serializeCapability()` convert between the two:

| Capability | Meaning |
| --- | --- |
| `Post\|read\|*` | read any post |
| `!Post\|delete\|*` | never delete a post (inverted) |
| `Post\|update\|{"authorId":"${user.id}"}\|title,body` | update the title and body of the caller's own posts |
| `all\|manage\|*` | anything |

`${user.<path>}` placeholders in conditions read the principal's attributes.

## Entity and field checks

The behavior stores the ability and the principal in the context. Inside the operation,
`CaslAuthorizer` checks the entity once it is loaded:

```ts
import { CaslAuthorizer } from '@cqrs-ddd/pipeline-casl';

const authorizer = new CaslAuthorizer();
const post = await posts.findById(command.id);
authorizer.authorize('update', post, ['title']);
post.retitle(command.title);

return authorizer.project('read', post, { id: post.id, title: post.title });
```

Without a constructor argument, it uses the ability of the running pipeline; a missing
ability denies. `getCaslAbility()` and `getCaslPrincipal()` read them in other behaviors.

## Options

| Option | Meaning | Default |
| --- | --- | --- |
| `rules` | the type-level requirements; `requires(...)` sets them | none: no check |

## Ordering and security

Place `CaslBehavior` in `globalBehaviors.before`, so it stays outermost even when a call site
redeclares it to pass its requirements. Cache and idempotency order themselves after it.

A type-level check does not replace the entity check: a cache or idempotency hit skips the
operation, so their keys must include the principal and its permission scope.
`abilityDigest(context)` is a digest of the caller's ability for that purpose:

```ts
const key = createPartitionedCacheKeyFactory({
  principal: (ctx) => getCaslPrincipal(ctx)?.id,
  scope: abilityDigest,
});
```

## HTTP errors

A denial throws `UnauthorizedActionException`. `toHttpResponse(error)` from
`@cqrs-ddd/pipeline-casl/http` returns a 403 answer with the denied `action` and
`subject`. See [HTTP errors](/ddd-cqrs/guides/http-errors/).

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-casl/)
