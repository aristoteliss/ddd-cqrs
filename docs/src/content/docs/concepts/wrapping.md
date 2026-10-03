---
title: How an operation is wrapped
description: The name, the kind and the request of a wrapped function or method, and when its configuration is checked.
sidebar:
  order: 1
---

`pipeline.wrap(options, ...entries)` prepares one operation. It returns a wrapper that
applies to a plain function or decorates a method; the same wrapper works with
TypeScript's standard decorators and with `experimentalDecorators`.

```ts
const wrapper = pipeline.wrap({ name: 'getPrice', kind: 'query' }, cache({ key }));

export const getPrice = wrapper(async (sku: string) => prices.find(sku));

class Prices {
  @pipeline.wrap({ kind: 'query' }, cache({ key }))
  async find(sku: string) {}
}
```

The options are optional when every value can be derived; the entries follow, outermost
first. `pipeline.wrap(cache({ key }))` is the same call without options.

## Entries

An entry is a behavior class, or a `[Behavior, options]` tuple. Each behavior package
exports a helper that builds its tuple, such as `cache({ key })`, `validated(schema)` or
`audit({ action })`. The options of an entry apply to this operation only.

## The name

The name tells operations apart in cache keys, idempotency keys, logs and traces.

| Wrapped | Name |
| --- | --- |
| a plain function | the `name` option; it is required |
| a method, with `name` | the `name` option |
| a method, without `name` | `Class.method`, from the instance it is called on |

Two values come from it. `context.handlerName` is the name above. `context.requestName` is
the `name` option when one is given; otherwise it is the class name of a branded request
(see below), and otherwise the handler name.

## The kind

The kind says what the operation does: a `query` reads, a `command` changes state, an
`event` reacts. Behaviors use it: idempotency applies to commands by default, a cache to
queries, and a global entry can be scoped to one kind.

The kind comes from the `kind` option, or from the request. A request whose class carries
the well-known symbol `REQUEST_KIND` declares its own kind:

```ts
import { REQUEST_KIND } from '@cqrs-ddd/pipeline';

class GetPriceQuery {
  get [REQUEST_KIND]() {
    return 'query' as const;
  }
  constructor(readonly sku: string) {}
}
```

`BaseCommand`, `BaseQuery` and `DomainEvent` of `@cqrs-ddd/core` carry it, so a method
that receives one needs neither `name` nor `kind`:
see [DDD without a framework](/ddd-cqrs/guides/ddd/). The symbol is
`Symbol.for('@cqrs-ddd/request-kind')`, so neither package depends on the other. A call
whose kind is neither declared nor carried fails with a `TypeError`.

## The request

Behaviors see the call's input as `context.request`:

- with one argument, the request is that argument;
- with several arguments, the request is the argument array.

A behavior that produces a new value, such as a validated copy, hands it to the function
with `replaceRequest(context, value)` instead of changing the caller's object. For a
function with several arguments, the value is the new argument array.

## Skipping a global behavior

`skip` lists global behaviors that this operation opts out of:

```ts
pipeline.wrap({ name: 'health', kind: 'query', skip: [LoggingBehavior] })(health);
```

## When the configuration is checked

Behaviors can declare a contract: ordering rules against other behaviors and checks of
their options. The pipeline runs these checks once per operation and kind, when the
wrapper is applied (at module load for a function, at class definition for a method)
if the `kind` option is set, and otherwise at the first call of each kind.

`createPipeline({ diagnostics })` decides what a violation does: `'strict'` (the default)
throws a `PipelineConfigurationError`, `'warn'` logs it through the pipeline's logger,
and `'off'` ignores it. A misconfigured operation therefore fails at startup, not at its
first request.
