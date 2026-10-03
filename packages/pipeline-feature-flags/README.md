# @cqrs-ddd/pipeline-feature-flags

Feature flags for `@cqrs-ddd/pipeline` through [OpenFeature](https://openfeature.dev): an
operation runs only while its boolean flag is on, with any OpenFeature provider
(Unleash, Flagsmith, LaunchDarkly, a file). `createFeatureFlagClient()` registers the
provider and resolves the client; `toHttpResponse()` from
`@cqrs-ddd/pipeline-feature-flags/http` turns a disabled feature into a 403, or a 404 that
hides it.

**Documentation:** [guide](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-feature-flags/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/cqrs-ddd/pipeline-feature-flags/) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-feature-flags @cqrs-ddd/pipeline @openfeature/server-sdk
```

Requires Node.js 22.12 or later. Published as an ES module; a CommonJS application loads
it with `require()`.

## Example

```ts
const client = await createFeatureFlagClient({ provider: new UnleashProvider(config) });
const pipeline = createPipeline({ behaviors: [new FeatureFlagBehavior(client)] });

export const checkout = pipeline.wrap(
  { name: 'checkout', kind: 'command' },
  featureFlag({ flag: 'new-checkout' }),
)(async (cart: Cart) => orders.place(cart));
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See `LICENSE` and
`COMMERCIAL_LICENSE.txt`.
