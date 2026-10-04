---
title: "@cqrs-ddd/pipeline-zod"
description: "Zod validation for wrapped functions and for request classes that carry their schema."
sidebar:
  order: 10
---

Validates and sanitizes inputs using [Zod](https://zod.dev) schemas before operations execute. Unknown properties are stripped, coercions and defaults applied, and invalid payloads rejected with structured validation errors.

Supports two integration patterns:
1. **Explicit schema decoration** via `validated(schema)` at the call site or handler.
2. **Class-embedded schemas** via `createCommand(schema)` and `createQuery(schema)` validated globally by `ZodValidationBehavior`.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-zod @cqrs-ddd/pipeline zod
```

Requires Node.js 22.12 or later and Zod 4.3 or later.

## Usage Patterns

### Pattern 1: Call-Site Decoration (`validated`)

The wrapped function or handler receives a sanitized, parsed copy. The original input argument is never mutated:

```typescript
import { createPipeline } from '@cqrs-ddd/pipeline';
import { validated } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

const OrderInputSchema = z.object({
  sku: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  coupon: z.string().optional().default('NONE'),
});

const pipeline = createPipeline();

export const placeOrder = pipeline.wrap(
  { name: 'placeOrder', kind: 'command' },
  validated(OrderInputSchema),
)(async (order) => {
  // order.quantity is parsed as a number, coupon defaults to 'NONE'
  return ordersRepo.create(order);
});

await placeOrder({ sku: 'WIDGET-01', quantity: '3' });
```

#### Multi-Argument Functions

Functions accepting multiple arguments are validated using `z.tuple()`:

```typescript
export const transferFunds = pipeline.wrap(
  { name: 'transferFunds', kind: 'command' },
  validated(z.tuple([z.string().uuid(), z.string().uuid(), z.number().positive()])),
)(async (fromId: string, toId: string, amount: number) => {
  return bank.transfer(fromId, toId, amount);
});
```

### Pattern 2: Request Classes with Embedded Schemas

Create command and query classes that encapsulate their validation schema:

```typescript
import { createCommand, createQuery } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

export class CreateUserCommand extends createCommand(
  z.object({
    username: z.string().min(3).max(30),
    email: z.string().email(),
  }),
) {}

export class GetUserQuery extends createQuery(
  z.object({
    userId: z.string().uuid(),
  }),
) {}
```

When `ZodValidationBehavior` runs globally, it validates any request class bearing an embedded schema:

```typescript
import { createPipeline } from '@cqrs-ddd/pipeline';
import { ZodValidationBehavior } from '@cqrs-ddd/pipeline-zod';

const pipeline = createPipeline({
  globalBehaviors: { scope: 'all', before: [ZodValidationBehavior] },
});
```

#### In-Place Request Validation Semantics

When validating request class instances:
- Validated values, defaults, and type coercions are reassigned directly to the request instance.
- Unrecognized keys are stripped.
- The request maintains its class identity (`instanceof CreateUserCommand === true`).

## Updatable Fields & Field-Level Authorization

For partial update (PATCH) commands, use `updatable` to declare allowed mutable fields for field-level authorization with [`@cqrs-ddd/pipeline-casl`](/ddd-cqrs/packages/pipeline-casl/):

```typescript
import { createCommand, updatable, updatableFieldsOf } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

export class UpdateUserCommand extends createCommand(
  z.object({
    id: z.string().uuid(),
    bio: updatable(z.string().max(200).optional()),
    role: updatable(z.enum(['user', 'admin']).optional()),
  }),
) {}

// The marked fields, in shape order:
UpdateUserCommand.updatableFields; // ['bio', 'role']
updatableFieldsOf(UpdateUserCommand.schema); // the same, from any object schema
```

Pass the fields a command changes to `authorizer.authorize('update', user, fields)` of `CaslAuthorizer`, which checks the caller may modify each one. A field without the mark is never listed, so mark every field the handler writes.

## Edge HTTP Mapping (`createZodMapper`)

Use `createZodMapper` at the HTTP boundary (Express, Fastify, NestJS controllers) to transform raw HTTP request payloads into strongly typed command or query instances:

```typescript
import { createZodMapper } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';
import { CreateUserCommand } from './create-user.command.js';

const CreateUserDtoSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
}).transform(({ name, email }) => new CreateUserCommand({ username: name, email }));

export const CreateUserMapper = createZodMapper(CreateUserDtoSchema);

// In HTTP Route Handler:
app.post('/users', async (req, res) => {
  const command = CreateUserMapper.map(req.body); // Throws ZodValidationError on invalid input
  const userId = await commandBus.execute(command);
  res.status(201).json({ id: userId });
});
```

`CreateUserMapper.map()` throws `ZodValidationError` synchronously on validation failure.

## NestJS Integration (`@cqrs-ddd/nestjs`)

In NestJS applications, use `@UsePipeline(validated(Schema))` directly on `@CommandHandler` or `@QueryHandler`:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { validated } from '@cqrs-ddd/pipeline-zod';
import { RegisterUserCommand, RegisterUserSchema } from './register-user.command.js';

@CommandHandler(RegisterUserCommand)
@UsePipeline(validated(RegisterUserSchema))
export class RegisterUserHandler implements ICommandHandler<RegisterUserCommand> {
  async execute(command: RegisterUserCommand) {
    // Guaranteed valid input
  }
}
```

The global `ErrorFilter` translates `ZodValidationError` into a NestJS `BadRequestException` formatted to match Nest's `ValidationPipe` convention:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": [
    "email: Invalid email address",
    "password: Too small: expected string to have >=8 characters"
  ]
}
```

## Error Handling & HTTP Translation

When validation fails, `ZodValidationError` is thrown. Its `details` property carries flattened issues:

```typescript
export interface ValidationDetails {
  readonly formErrors: readonly string[];
  readonly fieldErrors: Readonly<Record<string, readonly string[] | undefined>>;
}
```

Translating directly to HTTP using `@cqrs-ddd/pipeline-zod/http`:

```typescript
import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { toHttpResponse } from '@cqrs-ddd/pipeline-zod/http';

try {
  await placeOrder(badInput);
} catch (error) {
  if (!(error instanceof ZodValidationError)) throw error;
  const { status, body } = toHttpResponse(error);
  // status: 400
  // body: { statusCode: 400, error: 'Bad Request', message: 'Validation failed', details: { ... } }
}
```

## Behavior Ordering

Always position validation **before** behaviors that inspect request contents (such as caching, rate limiting, and idempotency). This guarantees that short-circuit keys are generated from validated, sanitized, and canonical data:

```typescript
@UsePipeline(
  validated(OrderSchema),                 // 1. Validate & sanitize
  requires({ action: 'create', subject: 'Order' }), // 2. Authorize
  idempotent({ keyFactory }),             // 3. Check idempotency with clean payload
)
export class CreateOrderHandler {}
```

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-zod/)
