# @cqrs-ddd/pipeline-casl

CASL authorization for `@cqrs-ddd/pipeline`. `CaslBehavior` checks type-level
requirements before the handler runs (`requires({ action, subject })`), loading the
caller's rules through your `ICaslPermissionSource`; `CaslAuthorizer` checks the loaded
entity and projects readable fields inside the handler. `toHttpResponse()` from
`@cqrs-ddd/pipeline-casl/http` turns a denial into a 403 answer.

**Documentation:** [guide](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-casl/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/cqrs-ddd/pipeline-casl/) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-casl @cqrs-ddd/pipeline @casl/ability
```

Requires Node.js 22.12 or later. Published as an ES module; a CommonJS application loads
it with `require()`.

## Example

```ts
const pipeline = createPipeline({ behaviors: [new CaslBehavior(permissionSource)] });

export const deletePost = pipeline.wrap(
  { name: 'deletePost', kind: 'command' },
  requires({ action: 'delete', subject: 'Post' }),
)(async (id: string) => posts.remove(id));
```

A type-level check does not replace the entity check after loading: a cache or
idempotency hit skips the handler, so their keys must include the principal and its
permission scope.

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See `LICENSE` and
`COMMERCIAL_LICENSE.txt`.
