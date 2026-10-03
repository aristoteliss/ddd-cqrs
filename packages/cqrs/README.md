# @cqrs-ddd/cqrs

Command, query and event buses for TypeScript, with a pipeline of behaviors around each
handler: `@CommandHandler`, `@QueryHandler`, `@EventsHandler`, `@UsePipeline` and
`@SkipPipeline` on handler classes, and `createCqrs()`, which builds the buses and
registers handler instances. No framework and no container.

**Documentation:** [guide](https://aristoteliss.github.io/ddd-cqrs/packages/cqrs/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/cqrs-ddd/cqrs/) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

## Installation

```bash
pnpm add @cqrs-ddd/cqrs @cqrs-ddd/pipeline
```

Requires Node.js 22.12 or later. The decorators work with TypeScript's standard decorators
and with `experimentalDecorators`. Published as an ES module; a CommonJS application loads
it with `require()`.

## Example

```ts
@CommandHandler(CreateUserCommand)
@UsePipeline(audit({ action: 'user.create' }))
class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(private readonly users: Users) {}
  async execute(command: CreateUserCommand) {}
}

const cqrs = createCqrs({ behaviors: [new AuditBehavior(sink)] });
cqrs.register(new CreateUserHandler(users));
await cqrs.commandBus.execute(new CreateUserCommand('Ann'));
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See `LICENSE` and
`COMMERCIAL_LICENSE.txt`.
