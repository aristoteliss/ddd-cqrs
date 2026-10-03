# @cqrs-ddd/pipeline-opentelemetry

OpenTelemetry behaviors for `@cqrs-ddd/pipeline`: `TraceBehavior` opens a span per
execution, `MetricsBehavior` records counts and durations, and `AttributesBehavior` puts
what the other behaviors decided (cache hit, idempotent replay, rate limit, flags) on the
span through the `build<Name>Attributes` factories of their packages. It depends only on
`@opentelemetry/api`; the application configures the SDK.

**Documentation:** [guide](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-opentelemetry/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/cqrs-ddd/pipeline-opentelemetry/) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-opentelemetry @cqrs-ddd/pipeline @opentelemetry/api
```

Requires Node.js 22.12 or later. Published as an ES module; a CommonJS application loads
it with `require()`.

## Example

```ts
const pipeline = createPipeline({
  globalBehaviors: {
    before: [
      [TraceBehavior, { tracerName: 'shop' }],
      [MetricsBehavior, { meterName: 'shop' }],
      [AttributesBehavior, { factories: [buildCacheAttributes] }],
    ],
  },
});
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See `LICENSE` and
`COMMERCIAL_LICENSE.txt`.
