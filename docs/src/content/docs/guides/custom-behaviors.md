---
title: Custom behaviors
description: Write a behavior with options, an entry helper, shared items and a contract that checks its configuration.
sidebar:
  order: 6
---

A behavior implements `IPipelineBehavior`: one method, `handle(context, next)`. It runs
code before `next()`, after it, or answers without calling it.

```ts
import type {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@cqrs-ddd/pipeline';

export class TimingBehavior implements IPipelineBehavior {
  constructor(private readonly record: (name: string, ms: number) => void) {}

  async handle(context: IPipelineContext, next: NextDelegate): Promise<unknown> {
    const start = performance.now();
    try {
      return await next();
    } finally {
      this.record(context.requestName, performance.now() - start);
    }
  }
}
```

A behavior is a plain class. Give the pipeline an instance when its constructor needs
arguments; a behavior placed without an instance is constructed with none.

```ts
const pipeline = createPipeline({
  behaviors: [new TimingBehavior((name, ms) => histogram.record(ms, { name }))],
  globalBehaviors: { before: [TimingBehavior] },
});
```

Check required constructor arguments in the constructor and throw a `TypeError`, so a
missing dependency fails when the pipeline is created, not at the first call.

## Options per operation

A call site passes options as a `[Behavior, options]` tuple; the behavior reads the merged
options with `context.getBehaviorOptions(Behavior)`. Export a helper that builds the tuple,
as every package does:

```ts
import type { PipelineBehaviorTuple } from '@cqrs-ddd/pipeline';

export interface TimingOptions {
  /** Calls slower than this many milliseconds are reported. @default 0 */
  threshold?: number;
}

export function timing(
  options: TimingOptions = {},
): PipelineBehaviorTuple<TimingBehavior, TimingOptions> {
  return [TimingBehavior, options];
}

// in handle():
const { threshold = 0 } = context.getBehaviorOptions<TimingOptions>(TimingBehavior) ?? {};
```

Options given both globally and at a call site are merged shallowly, the call site's
keys winning; see [Execution order](/ddd-cqrs/concepts/execution-order/).

## Sharing values with other behaviors

`context.items` carries values from one behavior to the next. Export a typed token for
each value another behavior may read:

```ts
import { createPipelineItem, setPipelineItem } from '@cqrs-ddd/pipeline';

export const DURATION_ITEM = createPipelineItem<number>('timing.duration');

setPipelineItem(context, DURATION_ITEM, elapsed);
```

## Replacing the input

A behavior that produces a new input, such as a parsed copy, hands it to the function with
`replaceRequest(context, value)` instead of changing the caller's object. Later behaviors
then see the replacement as `context.request`.

## A contract

A behavior class can declare a contract under the well-known symbol
`PIPELINE_BEHAVIOR_CONTRACT`: ordering rules against other behaviors, and a `validate`
function that checks the effective options of each operation. The pipeline runs the
contract once per operation, before its first execution; see
[How an operation is wrapped](/ddd-cqrs/concepts/wrapping/).

```ts
import {
  type IPipelineBehaviorContract,
  PIPELINE_BEHAVIOR_CONTRACT,
} from '@cqrs-ddd/pipeline';

export class TimingBehavior implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    order: { before: ['CacheBehavior'] },
    validate: (context) => {
      const threshold = (context.effectiveOptions as TimingOptions | undefined)?.threshold;
      if (threshold === undefined || threshold >= 0) return undefined;
      return [
        {
          handlerName: context.handlerName,
          behaviorName: 'TimingBehavior',
          message: `threshold must not be negative, received ${threshold}`,
          fix: 'Pass a threshold of 0 or more.',
        },
      ];
    },
  };
  // ...
}
```

An ordering rule names other behaviors by class or by identity string and applies only
when they are present. To require a peer, check `context.effectiveBehaviorTypes` in
`validate`.

## A stable identity

A behavior is identified by its class. When two copies of a package can be loaded, give
the class a stable string under `PIPELINE_BEHAVIOR_ID`, so both copies are recognized as
one behavior:

```ts
import { PIPELINE_BEHAVIOR_ID } from '@cqrs-ddd/pipeline';

export class TimingBehavior implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_ID] = 'my-package:TimingBehavior';
}
```

## Logging

Write through a `PipelineLogger` taken as an optional constructor argument, defaulting to
`console`. A NestJS `LoggerService` and most structured loggers satisfy the interface.
