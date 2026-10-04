# @cqrs-ddd/pipeline-correlation

Correlation id propagation for any Node.js application: an HTTP middleware
(`httpCorrelation()`, for Node's `http` server, Express or Connect), the
`@WithCorrelation()` method decorator for queue and message consumers and cron jobs
(both TypeScript decorator modes), a gRPC extraction preset (`CorrelationFrom.grpc()`), and
`correlationSource` for `createPipeline({ sources })` of `@cqrs-ddd/pipeline`.

**Documentation:** [guide](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-correlation/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/cqrs-ddd/pipeline-correlation/) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-correlation
```

Requires Node.js 22.12 or later. Published as an ES module; a CommonJS application loads
it with `require()`.

## Example

```ts
import { getCorrelationId, httpCorrelation } from '@cqrs-ddd/pipeline-correlation';

app.use(httpCorrelation());
app.get('/ping', (_req, res) => res.send(getCorrelationId()));
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See `LICENSE` and
`COMMERCIAL_LICENSE.txt`.
