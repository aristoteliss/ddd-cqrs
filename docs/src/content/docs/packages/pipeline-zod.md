---
title: "@cqrs-ddd/pipeline-zod"
description: "Zod validation for wrapped functions and for request classes that carry their schema."
sidebar:
  order: 10
---

Validates the input of an operation with [Zod](https://zod.dev) before it runs. There are
two ways to attach a schema:

- `validated(schema)` at the call site. The function receives a parsed copy (coerced
  values, defaults applied, unknown keys removed); the caller's value never changes.
- `createCommand()`, `createQuery()` or `createZodRequest()` build request classes that
  carry their schema. `ZodValidationBehavior`, placed globally, validates every such
  request in place.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-zod @cqrs-ddd/pipeline zod
```

## Usage

`ZodValidationBehavior` needs no constructor arguments, so the pipeline constructs it.

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import { validated } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

const pipeline = createPipeline();

export const placeOrder = pipeline.wrap(
  { name: 'placeOrder', kind: 'command' },
  validated(z.object({ sku: z.string(), qty: z.coerce.number().int().positive() })),
)(async (order) => orders.place(order));

await placeOrder({ sku: 'apple', qty: '2' }); // the function receives qty: 2
```

A function with several arguments is validated as a tuple:

```ts
const add = pipeline.wrap(
  { name: 'add', kind: 'query' },
  validated(z.tuple([z.coerce.number(), z.coerce.number()])),
)(async (a: number, b: number) => a + b);
```

## Request classes with a schema

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import { createCommand, ZodValidationBehavior } from '@cqrs-ddd/pipeline-zod';

export class CreateUserCommand extends createCommand(
  z.object({ username: z.string().min(3), email: z.email() }),
) {}

const pipeline = createPipeline({
  globalBehaviors: { scope: 'all', before: [ZodValidationBehavior] },
});
```

The behavior parses every request whose class carries a schema and passes any other
request through. It validates in place: omitted keys are deleted and parsed values are
assigned to the request before the handler runs, so the parsed result must be a plain
object. `createCommand()` and `createQuery()` accept an optional base class whose
constructor arguments they keep.

`updatable` marks the fields of an update command, and `updatableFieldsOf()` or the class's
`updatableFields` lists them, for field-level authorization with
[`@cqrs-ddd/pipeline-casl`](/ddd-cqrs/packages/pipeline-casl/).

## Options

| Option | Meaning | Default |
| --- | --- | --- |
| `schema` | the schema of the input; the function receives the parsed copy. `validated(schema)` sets it | the schema of the request class, applied in place |

## Ordering

Place validation outside behaviors that use the request, such as caching, idempotency and
rate limits, so their keys see the parsed values.

## HTTP errors

A failed validation throws `ZodValidationError`, whose `details` describe the issues.
`toHttpResponse(error)` from `@cqrs-ddd/pipeline-zod/http` returns a 400 answer with
`statusCode`, `error`, `message` and `details`. See [HTTP errors](/ddd-cqrs/guides/http-errors/).

## Mapping input

`createZodMapper(schema)` parses input at the HTTP edge, typically turning a request body
into a command:

```ts
export const CreateUserMapper = createZodMapper(
  CreateUserDtoSchema.transform(({ name, email }) => new CreateUserCommand(name, email)),
);

await commandBus.execute(CreateUserMapper.map(req.body));
```

`map()` parses synchronously and throws `ZodValidationError` on invalid input, whose
`details` hold `{ formErrors, fieldErrors }`; `toHttpResponse` answers it with HTTP 400.
The mapper's `schema` stays available for reuse.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-zod/)
