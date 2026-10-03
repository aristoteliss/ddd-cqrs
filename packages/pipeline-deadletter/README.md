# @cqrs-ddd/pipeline-deadletter

Dead letters for `@cqrs-ddd/pipeline`: a failed operation (events by default) is
captured with its request, error, tenant and correlation id, through a BullMQ, RabbitMQ
or PostgreSQL transport, and `DeadLetterRedriver` runs it again later.

**Documentation:** [guide](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-deadletter/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/cqrs-ddd/pipeline-deadletter/) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-deadletter @cqrs-ddd/pipeline
```

Requires Node.js 22.12 or later. Published as an ES module; a CommonJS application loads
it with `require()`.

## Example

```ts
const pipeline = createPipeline({ behaviors: [new DeadLetterBehavior(transport)] });

export const sendWelcome = pipeline.wrap({ name: 'sendWelcome', kind: 'event' }, deadLetter())(
  async (event: UserCreated) => mailer.welcome(event.userId),
);
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See `LICENSE` and
`COMMERCIAL_LICENSE.txt`.
