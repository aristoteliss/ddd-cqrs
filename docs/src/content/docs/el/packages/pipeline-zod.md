---
title: "@cqrs-ddd/pipeline-zod"
description: "Validation με Zod για συναρτήσεις wrapped από pipeline και για κλάσεις αιτημάτων που ενσωματώνουν το schema τους."
sidebar:
  order: 10
---

Επικυρώνει και καθαρίζει τα inputs χρησιμοποιώντας schemas [Zod](https://zod.dev) πριν την εκτέλεση λειτουργιών. Άγνωστες ιδιότητες αφαιρούνται, εφαρμόζονται μετατροπές τύπων (coercions) και προεπιλογές, ενώ μη έγκυρα payloads απορρίπτονται με δομημένα validation errors.

Υποστηρίζει δύο μοτίβα:
1. **Ρητή διακόσμηση schema** μέσω του `validated(schema)` στο call site ή στον handler.
2. **Ενσωματωμένα schemas σε κλάσεις** μέσω των `createCommand(schema)` και `createQuery(schema)` που επικυρώνονται καθολικά από το `ZodValidationBehavior`.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/pipeline-zod @cqrs-ddd/pipeline zod
```

Απαιτεί Node.js 22.12 ή νεότερο και Zod 4.3 ή νεότερο.

## Μοτίβα χρήσης

### Μοτίβο 1: Διακόσμηση Call-Site (`validated`)

Η διακοσμημένη συνάρτηση ή handler λαμβάνει ένα καθαρό, επικυρωμένο αντίγραφο. Το αρχικό όρισμα εισόδου δεν τροποποιείται ποτέ:

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
  return ordersRepo.create(order);
});

await placeOrder({ sku: 'WIDGET-01', quantity: '3' });
```

#### Συναρτήσεις πολλαπλών ορισμάτων

Συναρτήσεις με πολλαπλά ορίσματα επικυρώνονται με `z.tuple()`:

```typescript
export const transferFunds = pipeline.wrap(
  { name: 'transferFunds', kind: 'command' },
  validated(z.tuple([z.string().uuid(), z.string().uuid(), z.number().positive()])),
)(async (fromId: string, toId: string, amount: number) => {
  return bank.transfer(fromId, toId, amount);
});
```

### Μοτίβο 2: Κλάσεις αιτημάτων με ενσωματωμένα Schemas

Δημιουργήστε κλάσεις command και query που ενσωματώνουν το validation schema τους:

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

Όταν το `ZodValidationBehavior` εκτελείται καθολικά (globally), επικυρώνει αυτόματα κάθε κλάση αιτήματος με ενσωματωμένο schema:

```typescript
import { createPipeline } from '@cqrs-ddd/pipeline';
import { ZodValidationBehavior } from '@cqrs-ddd/pipeline-zod';

const pipeline = createPipeline({
  globalBehaviors: { scope: 'all', before: [ZodValidationBehavior] },
});
```

## Ενημερώσιμα πεδία & Field-Level Authorization

Για partial update (PATCH) commands, χρησιμοποιήστε το `updatable` για να δηλώσετε τα επιτρεπόμενα πεδία για έλεγχο εξουσιοδότησης με το [`@cqrs-ddd/pipeline-casl`](/ddd-cqrs/el/packages/pipeline-casl/):

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

UpdateUserCommand.updatableFields; // ['bio', 'role']
updatableFieldsOf(UpdateUserCommand.schema);
```

## Αντιστοίχιση HTTP στο Edge (`createZodMapper`)

Χρησιμοποιήστε το `createZodMapper` στο HTTP boundary (Express, Fastify, NestJS controllers) για να μετατρέψετε raw payloads σε strongly typed instances commands ή queries:

```typescript
import { createZodMapper } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';
import { CreateUserCommand } from './create-user.command.js';

const CreateUserDtoSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
}).transform(({ name, email }) => new CreateUserCommand({ username: name, email }));

export const CreateUserMapper = createZodMapper(CreateUserDtoSchema);

app.post('/users', async (req, res) => {
  const command = CreateUserMapper.map(req.body);
  const userId = await commandBus.execute(command);
  res.status(201).json({ id: userId });
});
```

Το `CreateUserMapper.map()` ρίχνει σύγχρονα `ZodValidationError` σε αποτυχία validation.

## Ενσωμάτωση NestJS (`@cqrs-ddd/nestjs`)

Σε εφαρμογές NestJS, χρησιμοποιήστε το `@UsePipeline(validated(Schema))` απευθείας σε `@CommandHandler` ή `@QueryHandler`:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { validated } from '@cqrs-ddd/pipeline-zod';
import { RegisterUserCommand, RegisterUserSchema } from './register-user.command.js';

@CommandHandler(RegisterUserCommand)
@UsePipeline(validated(RegisterUserSchema))
export class RegisterUserHandler implements ICommandHandler<RegisterUserCommand> {
  async execute(command: RegisterUserCommand) {}
}
```

Το παγκόσμιο `ErrorFilter` μεταφράζει το `ZodValidationError` σε `BadRequestException` του NestJS.

## Διαχείριση σφαλμάτων & HTTP αντιστοίχιση

Όταν το validation αποτυγχάνει, ρίχνεται `ZodValidationError`:

```typescript
import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { toHttpResponse } from '@cqrs-ddd/pipeline-zod/http';

try {
  await placeOrder(badInput);
} catch (error) {
  if (!(error instanceof ZodValidationError)) throw error;
  const { status, body } = toHttpResponse(error);
}
```

## Σειρά των behaviors

Τοποθετείτε πάντοτε το validation **πριν** από behaviors που εξετάζουν το περιεχόμενο του αιτήματος (όπως caching, rate limiting και idempotency):

```typescript
@UsePipeline(
  validated(OrderSchema),                           // 1. Validation & sanitization
  requires({ action: 'create', subject: 'Order' }), // 2. Authorization
  idempotent({ keyFactory }),                       // 3. Idempotency με καθαρό payload
)
export class CreateOrderHandler {}
```

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-zod/)
