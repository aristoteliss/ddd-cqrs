---
title: Execution order
description: In which order global and call-site behaviors run, how a behavior declared twice is merged, and how scopes select global behaviors.
sidebar:
  order: 2
---

```
┌─ globalBehaviors.before ─┐   ┌── call site ──┐   ┌─ globalBehaviors.after ─┐
│ LoggingBehavior          │ → │ CacheBehavior │ → │ TraceBehavior           │ → the function
└──────────────────────────┘   └───────────────┘   └─────────────────────────┘
                       ← the result returns through the chain ←
```

Every behavior receives the context and `next`, the rest of the chain. It runs code
before calling `next()`, after it, or answers without calling it, as a cache hit does.

| Position | Declared in | Runs |
| --- | --- | --- |
| Global before | `createPipeline({ globalBehaviors: { before } })` | first, outermost |
| Call site | `pipeline.wrap(options, ...entries)` | in the order of the entries |
| Global after | `createPipeline({ globalBehaviors: { after } })` | last, closest to the function |

## Scopes

`globalBehaviors` is one object or an array of objects, each with a `scope`: `'commands'`,
`'queries'`, `'events'` or `'all'` (the default). The entries of every matching object
apply, in the order they are listed:

```ts
createPipeline({
  globalBehaviors: [
    { scope: 'all', before: [LoggingBehavior] },
    { scope: 'commands', before: [AuditBehavior] },
    { scope: 'queries', after: [CacheBehavior] },
  ],
});
```

## A behavior declared twice

A behavior class runs at most once per operation.

- Declared globally and at the call site, it runs at its **global** position, with the
  call-site options shallowly merged over the global options.
- Declared in two global entries, the first one fixes its position; a later tuple can
  still add options.

This keeps a guard where it was placed. An authorization behavior placed in
`globalBehaviors.before` stays outside a cache or idempotency behavior, even when a call site
redeclares it to pass its rules, so a cached answer never bypasses the check.

## Ordering rules

A behavior can declare that it must run before or after another one when both are
present; idempotency, for example, must run after authorization. A chain that breaks such a
rule fails the configuration check described in
[How an operation is wrapped](/ddd-cqrs/concepts/wrapping/). The rules check the order;
they do not reorder the chain.

## Nested operations

A wrapped function that calls another wrapped function starts a nested pipeline. The
nested one takes its tenant and correlation id from the outer one unless a source says
otherwise: see [The pipeline context](/ddd-cqrs/concepts/context/).
