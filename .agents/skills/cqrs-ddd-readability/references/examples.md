# Examples

Before/after pairs drawn from patterns in this repository. The "before" side shows a
pattern found in the code or one the rules forbid; the "after" side shows the shape to
write. Fixtures use synthetic names and `example.test` addresses only. Imports and the
license header are left out for brevity.

## 1. A fat handler made thin

Pattern from: an inline rate limit, events published by hand, and limits restated
outside `Role.rules`; `RefreshAuthHandler` in
`api/src/auths/application/cqrs/commands/refresh-auth.handler.ts` shows the same rate
limit as a pipeline entry. Rules: C3, C5, C6, C10, D4.

Before:

```ts
export class RenameRoleHandler extends CommandBaseHandler<RenameRoleCommand, Role> {
  constructor(
    private readonly commandRepository: IWriteSideAggregateRepository<Role>,
    private readonly authorizer: CaslAuthorizer,
    private readonly rateLimiter: RateLimiterLike,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: RenameRoleCommand): Promise<Role> {
    await this.rateLimiter.consume(
      joinKeySegments([requireTenant('rename role'), command.id]),
      1,
    );
    const role = await this.commandRepository.findById(command.id);
    if (!role) {
      throw new EntityNotFoundException('Role', command.id);
    }
    this.authorizer.authorize('update', role, ['name']);
    const name = command.name.trim();
    if (name.length < 3 || name.length > 128) {
      throw new InvalidRoleNameException({ field: 'name', rule: 'minLength', limit: 3 });
    }
    role.rename(name);
    await this.commandRepository.save(role);
    this.eventBus.publishAll([...role.getUncommittedEvents()], role);
    role.uncommit();
    return role;
  }
}
```

After:

```ts
@CommandHandler(RenameRoleCommand)
@UsePipeline(
  requires({ action: APP_ACTIONS.UPDATE, subject: APP_SUBJECTS.ROLE }),
  rateLimit({
    keyFactory: createPartitionedRateLimitKeyFactory(sessionPrincipalKey),
    points: RATE_LIMIT_COST.renameRole,
  }),
)
export class RenameRoleHandler extends CommandBaseHandler<RenameRoleCommand, Role> {
  constructor(
    private readonly commandRepository: IWriteSideAggregateRepository<Role>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: RenameRoleCommand): Promise<Role> {
    const role = await this.commandRepository.findById(command.id);
    if (!role) {
      throw new EntityNotFoundException('Role', command.id);
    }
    this.authorizer.authorize('update', role, ['name']);
    role.rename(command.name);
    await this.commandRepository.save(role);
    return role;
  }
}
```

What changed:

- The rate limit is a pipeline entry, so the handler loses a dependency and a concern.
  `renameRole` is a new entry in `RATE_LIMIT_COST`.
- The name limits live once, in `Role.rules.name`: the command schema reads them and
  `role.rename()` enforces them.
- `CommandBaseHandler.execute()` publishes the buffered events after `handle()` returns,
  so publishing them by hand is removed.
- `rename` records `RoleRenamedEvent` (D6), so the command, the method and the event share
  one verb.

## 2. An anemic aggregate given behavior

Pattern from: the synthetic-snapshot mutation that `AGENTS.md` rule 7 forbids and that
`biome/plugins/aggregate-identity.grit` cannot see. Rules: D2, D3, D6, C1.

Before:

```ts
async handle(command: AssignDepartmentCommand): Promise<User> {
  const user = await this.commandRepository.findById(command.id);
  if (!user) {
    throw new EntityNotFoundException('User', command.id);
  }
  this.authorizer.authorize('update', user, ['department']);
  const changed = User.fromJSON({ ...user.toJSON(), department: command.department });
  await this.commandRepository.save(changed);
  return changed;
}
```

The change records no event, does not advance `updatedAt` or the version, and bypasses
the `@Mutable` normalizer. Widening the generic `update(fields)` or adding a public setter
would hide the intent in the same way.

After, in `api/src/users/domain/models/user.entity.ts`:

```ts
@ApplyMutation<User>({ event: (user) => new UserDepartmentAssignedEvent(user) })
assignDepartment(department: string | null): this {
  this.applyPatch({ department });
  return this;
}
```

In `api/src/users/domain/events/user-department-assigned.event.ts`:

```ts
export class UserDepartmentAssignedEvent extends RootDomainEvent<User> {
  public constructor(entity: User) {
    super(entity);
  }
}
```

And the handler:

```ts
async handle(command: AssignDepartmentCommand): Promise<User> {
  const user = await this.commandRepository.findById(command.id);
  if (!user) {
    throw new EntityNotFoundException('User', command.id);
  }
  this.authorizer.authorize('update', user, ['department']);
  user.assignDepartment(command.department);
  await this.commandRepository.save(user);
  return user;
}
```

One verb runs through the command, the method and the event:
`AssignDepartment` → `assignDepartment` → `UserDepartmentAssignedEvent`.

## 3. A primitive replaced by a value rule, and by a value object

### 3a. The default: a value rule

Pattern from: `User.email` in `api/src/users/domain/models/user.entity.ts`, which the
domain stores unchecked while only `EmailSchema` validates it. Rules: D4, D5, C10.

Before:

```ts
readonly email: string;

private constructor(snapshot?: UserSnapshot) {
  // ...
  this.email = snapshot.email;
}
```

After:

```ts
public static readonly rules = {
  // username and department as today
  email: textRule({
    field: 'email',
    maxLength: 254,
    pattern: /^[^\s@]+@[^\s@]+$/,
    error: (violation) => new InvalidEmailException(violation),
  }),
} as const;

private constructor(snapshot?: UserSnapshot) {
  // ...
  this.email = User.rules.email.parse(snapshot.email);
}
```

`InvalidEmailException extends InvalidValueException` lives in
`domain/models/errors/invalid-email.exception.ts`; add it to `domainAnswer` beside the
other value exceptions so that it answers 422. `fromJSON` parses through the same rule, so stored rows must
already satisfy it before the rule is introduced.

### 3b. When a value object is justified

Pattern from: `integration/payments/payment-service.ts`, where `amount` and `currency`
travel as two primitives (`capture(amount: number, currency: string)`). The two fields
belong together and the concept has behavior of its own. Rules: D5, A6.

Before:

```ts
export interface PaymentGateway {
  capture(amount: number, currency: string): Promise<string>;
}
```

After, in `<context>/domain/models/money.value.ts`:

```ts
const amountRule = numberRule({
  field: 'amount',
  integer: true,
  min: 1,
  error: (violation) => new InvalidAmountException(violation),
});

export type Currency = 'EUR' | 'USD';

export class Money {
  private constructor(
    readonly amount: number,
    readonly currency: Currency,
  ) {}

  static of(amount: number, currency: Currency): Money {
    return new Money(amountRule.parse(amount), currency);
  }

  add(other: Money): Money {
    if (other.currency !== this.currency) {
      throw new CurrencyMismatchException(this.currency, other.currency);
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }
}

export interface PaymentGateway {
  capture(total: Money): Promise<string>;
}
```

A single field such as a username or a role name stays a primitive with a value rule;
wrapping it in a class adds a type and a file without adding meaning.

## 4. An over-abstracted piece simplified

Pattern from: the near-identical `DeleteUserHandler` and `DeleteRoleHandler`, which
invite a generic base handler. Rules: A2, principle 6.

Before:

```ts
export abstract class DeleteAggregateHandler<
  TCommand extends { id: string },
  TAggregate extends RootEntity & { delete(): unknown },
> extends CommandBaseHandler<TCommand, TAggregate> {
  protected abstract readonly aggregateLabel: string;

  constructor(
    private readonly commandRepository: IWriteSideAggregateRepository<TAggregate>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: TCommand): Promise<TAggregate> {
    const aggregate = await this.commandRepository.findById(command.id);
    if (!aggregate) {
      throw new EntityNotFoundException(this.aggregateLabel, command.id);
    }
    this.authorizer.authorize('delete', aggregate);
    aggregate.delete();
    await this.commandRepository.save(aggregate);
    return aggregate;
  }
}

export class DeleteRoleHandler extends DeleteAggregateHandler<DeleteRoleCommand, Role> {
  protected readonly aggregateLabel = 'Role';
}
```

After, as `api/src/roles/application/cqrs/commands/delete-role.handler.ts` has it:

```ts
export class DeleteRoleHandler extends CommandBaseHandler<DeleteRoleCommand, Role> {
  constructor(
    private readonly commandRepository: IWriteSideAggregateRepository<Role>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: DeleteRoleCommand): Promise<Role> {
    const role = await this.commandRepository.findById(command.id);
    if (!role) {
      throw new EntityNotFoundException('Role', command.id);
    }
    this.authorizer.authorize('delete', role);
    role.delete();
    await this.commandRepository.save(role);
    return role;
  }
}
```

Each handler now reads alone, names its aggregate, and can diverge (another pipeline,
another precondition) without a type parameter or a protected hook. The repeated code is
ten obvious lines; the base class would cost a generic signature every reader must decode.
The same reasoning rejects an `IRoleNamePolicy` interface with one implementation around
`Role.rules.name`, and a `UserService` that only forwards to a repository.

## 5. Duplicated validation derived from the command

Pattern from: a route schema that restates the limits `CreateUserCommand` already reads
from `User.rules`. Rule: C10.

Before:

```ts
const NewUser = z.object({
  email: EmailSchema,
  name: z
    .string()
    .trim()
    .min(User.rules.username.minLength)
    .max(User.rules.username.maxLength),
  department: z
    .string()
    .trim()
    .min(User.rules.department.minLength)
    .max(User.rules.department.maxLength)
    .optional(),
});
```

After, as `NewUser` in `api/src/users/routes.ts` has it:

```ts
const NewUser = z.object({
  email: CreateUserCommand.schema.shape.email,
  name: CreateUserCommand.schema.shape.username,
  department: CreateUserCommand.schema.shape.department,
});
```
