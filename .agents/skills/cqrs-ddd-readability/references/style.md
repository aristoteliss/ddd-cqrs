# Style

The shapes the code in `api/src/` and `packages/core/` uses for each building block, taken
from the files named below. Copy the shape and change only the names. License headers and most imports are left
out. When this file and the code disagree, the code wins; correct this file.

## Copy from

Each row names the cleanest existing file of its kind. Where a row's file also carries an
item listed under "Existing deviations" in [conventions.md](conventions.md), copy its
shape and leave that item out.

| Kind | Copy | Shows |
| --- | --- | --- |
| Aggregate | `api/src/roles/domain/models/role.entity.ts` | the smallest complete aggregate |
| Aggregate with a guard | `api/src/users/domain/models/user.entity.ts` | a whole-call guard before `applyPatch` |
| Aggregate with outcomes | `api/src/auths/domain/models/auth.entity.ts` | a decision method over `protected apply<Noun>` methods |
| Domain event | `api/src/roles/domain/events/role-created.event.ts` | the default snapshot payload |
| Domain event, narrowed | `api/src/auths/domain/events/auth-started.event.ts` | a payload that leaves secrets out |
| Value exception | `api/src/users/domain/models/errors/invalid-username.exception.ts` | one line and one JSDoc line |
| Business exception | `api/src/users/domain/models/errors/email.exception.ts` | a message built from the aggregate |
| Create command | `api/src/users/application/cqrs/commands/create-user.command.ts` | limits read from `User.rules` |
| PATCH command | `api/src/users/application/cqrs/commands/update-user.command.ts` | `updatable`, nullable fields, a cross-field refine |
| Create handler | `api/src/roles/application/cqrs/commands/create-role.handler.ts` | create, authorize, save |
| Change handler | `api/src/users/application/cqrs/commands/update-user.handler.ts` | load, not found, authorize, one call, save |
| Delete handler | `api/src/roles/application/cqrs/commands/delete-role.handler.ts` | the same flow with a retry entry |
| List query handler | `api/src/users/application/cqrs/queries/get-users.handler.ts` | filter by `can`, map through the projection |
| Composite query handler | `api/src/users/application/cqrs/queries/get-user-overview.handler.ts` | private helpers below `execute`, the result type in its read-model file |
| Event handler | `api/src/users/application/cqrs/events/user-updated.handler.ts` | destructure the payload, call one port |
| Read model | `api/src/roles/application/role-read-model.ts` | candidate, projected type, projector |
| Port | `api/src/auths/application/ports/refresh-tokens.port.ts` | a capability noun with short verb methods |
| Library factory | `packages/core/domain/rules/text.rule.ts` | options refused at creation, then a frozen result |

## Aggregate

Members appear in this order: `aggregateName`, `rules`, `@Mutable` backing fields, readonly
fields, the private constructor, `create`, `fromJSON`, each getter beside its private
setter, the behavior methods, then `toJSON`.

```ts
export interface RoleSnapshot extends Partial<RootEntitySnapshot> {
  readonly name: string;
}

export class Role extends RootEntity<RoleSnapshot> {
  public static readonly aggregateName = 'role';
  public static readonly rules = {
    name: textRule({
      field: 'name',
      minLength: 3,
      maxLength: 128,
      error: (violation) => new InvalidRoleNameException(violation),
    }),
  } as const;

  @Mutable<string>({ normalize: (value) => Role.rules.name.parse(value) })
  private _name: string;

  private constructor(snapshot?: RoleSnapshot) {
    super(snapshot);
    if (!snapshot) {
      this._name = '';
      return;
    }
    this._name = Role.rules.name.parse(snapshot.name);
  }

  static create(name: string): Role {
    const role = new Role({ name });

    role.apply(new RoleCreatedEvent(role));

    return role;
  }

  static fromJSON(snapshot: RoleSnapshot): Role {
    return new Role({
      id: Role.normalizeId(snapshot.id),
      name: Role.rules.name.parse(snapshot.name),
      createdAt: Role.normalizeDate(snapshot.createdAt),
      updatedAt: Role.normalizeDate(snapshot.updatedAt),
      version: snapshot.version ?? 1,
    });
  }

  get name(): string {
    return this._name;
  }

  private set name(value: string) {
    this._name = Role.rules.name.parse(value);
  }

  @ApplyMutation<Role>({ event: (role) => new RoleRenamedEvent(role) })
  rename(name: string): this {
    this.applyPatch({ name });
    return this;
  }

  @ApplyMutation<Role>({ event: (role) => new RoleDeletedEvent(role) })
  delete(): this {
    return this;
  }

  toJSON(): RootEntitySnapshot & RoleSnapshot {
    return this.freezeState({
      id: this.id,
      name: this._name,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
    });
  }
}
```

- `rename` records `RoleRenamedEvent`, as SKILL.md D6 requires.
- The snapshot interface sits in the aggregate's file, extends
  `Partial<RootEntitySnapshot>`, and marks every field `readonly`. A nullable field is
  `?: T | null`.
- The constructor's `if (!snapshot)` branch gives every field an empty default and returns.
  With a snapshot, every field that has a rule is parsed through it.
- `fromJSON` normalizes `id` and the dates through the `RootEntity` helpers and defaults
  `version` to `1`. It records no event.
- A backing field is `_<name>`. Its public getter and its private setter sit together, and
  the setter parses through the same rule as the normalizer.
- An `@ApplyMutation` lambda names its parameter after the aggregate (`(role) =>`,
  `(user) =>`). The method body is `this.applyPatch({ ... })` and `return this`; a
  deletion's body is `return this`.
- A guard that rejects the whole call comes before `applyPatch`, as in `User.update`:

```ts
@ApplyMutation<User>({ event: (user) => new UserUpdatedEvent(user) })
update(fields: {
  username?: string | null;
  department?: string | null;
}): this {
  if (fields.username === undefined && fields.department === undefined) {
    throw new EmptyUserUpdateException();
  }

  this.applyPatch({
    username: fields.username ?? undefined,
    department: fields.department,
  });
  return this;
}
```

### A business verb with several outcomes

When one verb can end in different outcomes (no change, one kind of change, another kind
of change then a rejection), the public method makes the decision and leaves each state
change to a `protected` `@ApplyMutation` method named `apply<Noun>`. `Auth` does this:

```ts
revoke(now: number): void {
  if (this._revokedAt !== null) return;
  this.applyRevocation(now);
}

@ApplyMutation<Auth>({ event: (auth) => new AuthRevokedEvent(auth) })
protected applyRevocation(now: number): this {
  this.applyPatch({ revokedAt: now });
  return this;
}
```

The decision stays readable, and each recorded change still advances the version and
records its event. `Auth` documents its public methods with JSDoc that names each outcome
and each `@throws`, because the refresh protocol is not obvious from the names. Ordinary
aggregates (`User`, `Role`) carry no comments.

### Child entities

- An entity that only carries reference data and changes through no command
  (`Capability`) extends `RootEntity` with a public constructor and `readonly` fields. It
  has no rules, no `create` and no events.
- A part of one aggregate that the aggregate creates (`ConsumedRefreshToken` in `Auth`) is
  a plain class with `readonly` constructor parameters. The aggregate exposes it through a
  getter and clears it in an `override uncommit()`.

## Value rules and errors

- Every limit is a `textRule` or `numberRule` in `static readonly rules = { ... } as const`.
  An optional field adds `required: false`. Each rule names its error as
  `error: (violation) => new Invalid<Field>Exception(violation)`.
- A value exception is one line with one JSDoc line that names the rule it guards:

```ts
/** A username breaks `User.rules.username`. */
export class InvalidUsernameException extends InvalidValueException {}
```

- A business exception has one JSDoc line that states the condition. Its constructor
  builds the message and keeps the offending aggregate as a `readonly` field:

```ts
/** The email address of `user` already belongs to another user in the tenant. */
export class UniqueEmailException extends DomainException {
  readonly user: User;

  constructor(user: User) {
    super(`Email ${user.email} already exists`);
    this.user = user;
  }
}
```

- `DomainException` sets `name` from the class, so a subclass does not assign
  `this.name`.
- A context with several error files exports them from `domain/models/errors/index.ts`,
  and the aggregate imports from that file.

## Domain events

By default, an event carries the aggregate snapshot that `RootDomainEvent` builds:

```ts
export class RoleCreatedEvent extends RootDomainEvent<Role> {
  public constructor(entity: Role) {
    super(entity);
  }
}
```

When the snapshot holds material that must not leave the aggregate (token hashes), the
event declares a narrower payload type, builds it in the constructor, and says why in one
JSDoc line:

```ts
/** A session started. The payload carries no token material. */
export class AuthStartedEvent extends RootDomainEvent<
  Auth,
  { userId: string; expiresAt: number }
> {
  constructor(entity: Auth) {
    super(entity, { userId: entity.userId, expiresAt: entity.expiresAt });
  }
}
```

## Commands

```ts
export class CreateUserCommand extends createCommand(
  z.object({
    username: z
      .string()
      .trim()
      .min(User.rules.username.minLength)
      .max(User.rules.username.maxLength),
    email: EmailSchema,
    department: z
      .string()
      .trim()
      .min(User.rules.department.minLength)
      .max(User.rules.department.maxLength)
      .optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  }),
  BaseCommand,
) {}
```

- A text field is `.string().trim()` and then reads `.min`/`.max` from the aggregate's
  rule. An identifier is `z.uuid()`. Shared shapes come from `common/validation/`.
- A PATCH field adds `.apply(updatable)` before `.nullable()` and `.optional()`. A rule
  that spans fields is a `.refine(...)` on the object, as in `UpdateUserCommand`.
- The class body is empty: `{}`.

## Command handlers

```ts
@CommandHandler(UpdateUserCommand)
@UsePipeline(
  requires({ action: APP_ACTIONS.UPDATE, subject: APP_SUBJECTS.USER }),
  audit({
    action: AUDIT_ACTIONS.USER_UPDATE,
    severity: AUDIT_SEVERITY.MEDIUM,
    metadata: targetMetadata('targetUserId'),
  }),
)
export class UpdateUserHandler extends CommandBaseHandler<
  UpdateUserCommand,
  User
> {
  constructor(
    private readonly commandRepository: IWriteSideAggregateRepository<User>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: UpdateUserCommand): Promise<User> {
    const { id, username, department } = command;

    const user = await this.commandRepository.findById(id);
    if (!user) {
      throw new EntityNotFoundException('User', id);
    }

    this.authorizer.authorize(
      'update',
      user,
      command.getUpdateFields(UpdateUserCommand.updatableFields),
    );

    user.update({ username, department });

    await this.commandRepository.save(user);

    return user;
  }
}
```

A create handler builds the aggregate first, then authorizes the new aggregate against the
fields it sets:

```ts
async handle(command: CreateRoleCommand): Promise<Role> {
  const role = Role.create(command.name);

  this.authorizer.authorize('create', role, ['name']);

  await this.commandRepository.save(role);

  return role;
}
```

- An `audit` entry names the aggregate it targets with `targetMetadata` from
  `api/src/common/audit/audit.options.ts`, the factory rule C7 asks for.
- `@CommandHandler` comes first, then `@UsePipeline`. Existing handlers list pipeline
  entries in this order: `metrics`, `logging`, `requires`, `featureFlag`, `rateLimit`,
  `idempotent`, `deadLetter`, `audit`, `resilience`. Pipeline order changes behavior; its
  meaning belongs to `cqrs-ddd-architecture`.
- A `logging` entry maps an expected business exception to `'warn'`
  (`mapLogLevel: new Map([[UniqueEmailException, 'warn']])`).
- A create handler depends on `ICommandRepository<X, XSnapshot>` and imports
  `{ X, type XSnapshot }`. A change or delete handler depends on
  `IWriteSideAggregateRepository<X>` and imports `type { X }`.
- The constructor takes `(commandRepository, authorizer, eventBus)` and calls
  `super(eventBus)`.
- Destructure the command when `handle` reads two or more of its fields; otherwise read
  `command.<field>`.

## Query handlers

```ts
@QueryHandler(GetUsersQuery)
@UsePipeline(requires({ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER }))
export class GetUsersHandler
  implements IQueryHandler<GetUsersQuery, UserReadModel[]>
{
  constructor(
    private readonly queryRepository: IQueryRepository<GetUsersQuery, User[]>,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(query: GetUsersQuery): Promise<UserReadModel[]> {
    const users = await this.queryRepository.find(query);
    return users
      .filter((user) => this.authorizer.can(APP_ACTIONS.READ, user))
      .map((user) => projectUserRead(this.authorizer, user));
  }
}
```

- A query handler `implements IQueryHandler<XQuery, Result>`. It does not extend a base
  class, and its constructor takes `(queryRepository, authorizer)`.
- A single result ends with `return x ? projectXRead(this.authorizer, x) : null;`. A list
  filters with `can` and maps through the projector.
- A composite handler loads, returns early with `if (!user) return null;`, authorizes,
  builds the candidate and projects it. Each sub-read is a `private async` method below
  `execute`. A pure helper that needs no instance state is a module function after the
  class (`capabilityLabel`).
- A query class is `createQuery(z.object({ ... }), BaseQuery)` with an empty body, and a
  query that takes no input is `createQuery(z.object({}), BaseQuery)`.

## Read models

```ts
interface RoleReadCandidate {
  id: string;
  name: string;
}

/** The fields of a Role the current caller may read; any field can be absent. */
export type RoleReadModel = Projected<RoleReadCandidate>;

export function projectRoleRead(
  authorizer: CaslAuthorizer,
  role: Role,
): RoleReadModel {
  return authorizer.project('read', role, { id: role.id, name: role.name });
}
```

## Event handlers

```ts
@EventsHandler(UserUpdatedEvent)
export class UserUpdatedHandler implements IEventHandler<UserUpdatedEvent> {
  constructor(private readonly userBatchDispatcher: IUserBatchDispatcher) {}

  async handle(event: UserUpdatedEvent): Promise<void> {
    const { id: userId, username } = event.payload;

    await this.userBatchDispatcher.enqueue([{ userId, username }]);
  }
}
```

- Destructure only the payload fields the handler uses, renaming `id` to `<noun>Id`. A
  blank line separates the destructuring from the single awaited port call.
- `@UsePipeline(deadLetter({ rethrow: false }))` captures a failure in the dead-letter
  queue without failing the command that published the event (`UserCreatedHandler`).
- A port method is a short verb that does not repeat its receiver
  (`userBatchDispatcher.enqueue(...)`).

## Ports

```ts
/** Creates opaque refresh tokens and the digests sessions store instead of them. */
export interface IRefreshTokens {
  generate(): string;
  /** Must be deterministic and unsalted: the digest is the session lookup key. */
  hash(token: string): string;
}
```

- A behavior port is `I<Capability>` (`IRefreshTokens`, `ISessionCookies`,
  `IAccessTokenIssuer`). Its methods are short verbs (`generate`, `hash`, `save`, `clear`,
  `issue`, `verify`).
- A data port drops the `I` (`AuthTokenPolicy`) and holds `readonly` settings that are
  bound at startup.
- The interface has one JSDoc block for its contract. A member gets a doc comment only for
  units, the meaning of an absent value, or a security constraint. A request or result
  type is `<Noun><Verb>Request`/`Result` (`AccessTokenIssueRequest`).

## Library functions

A function in `packages/*` reads in the order its work happens (SKILL.md, principle 8 and
G12). It skips the steps it does not need.

| Step | Form | Example |
| --- | --- | --- |
| Take the input | Up to 3 positional parameters, or one options object destructured once | `textRule(options)` destructures `field`, `required`, `minLength` and the rest on its first lines |
| Refuse | `TypeError` throws on the first lines, before anything is built or written | `assertField`, `assertLength` and the `minLength > maxLength` check in `textRule` |
| Decide | Every check and normalization finishes before the first write | phase 1 of `RootEntity.applyPatch` collects the normalized writes |
| Act | The writes, events or calls the decision asks for | phase 2 of `applyPatch` writes the backing fields |
| Return | The result, or a frozen value built from it | `return Object.freeze({ ...options, parse })` |

- A factory or decorator refuses bad options when it is created, so the mistake surfaces
  at startup: `ApplyMutation` throws when its `event` option is missing, before any
  method runs.
- A single blank line may separate these steps in a long function. A step has no blank line
  inside it.
- A short step marker (`// Phase 1: validate all keys and normalize values before any state
  changes`) is welcome only inside a multi-phase core mechanism (`AGENTS.md`, Documentation
  and comment policy).

## Small habits

- Early exits: a single `return` sits on one line (`if (!user) return null;`,
  `if (this._revokedAt !== null) return;`). A not-found `throw` in a command handler is a
  braced block.
- Blank lines separate the phases of a longer body (load and guard, decide, persist and
  return), the destructuring of an event payload from the call that uses it, and the
  `apply()` call inside a factory.
- A lambda parameter is the domain noun (`(role) =>`, `(violation) =>`). A pipeline context
  is `ctx`.
- Type-only imports use `import type`, or an inline `type` when an import mixes values and
  types. Constants come from `common/constants/index.js`.
