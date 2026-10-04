/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Behavior identity is the class, not its name: two unrelated classes that share
 * a name are two behaviors. Merged, only one would run, with the other's options,
 * and a security guard could leave the chain unnoticed.
 */

import { CommandHandler, createCqrs } from '@cqrs-ddd/cqrs';
import type {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@cqrs-ddd/pipeline';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { beforeEach, describe, expect, it } from 'vitest';

const order: string[] = [];

/** Builds a distinct class that deliberately reuses the same class name. */
function makeNamedBehavior(tag: string) {
  class LoggingBehavior implements IPipelineBehavior {
    async handle(context: IPipelineContext, next: NextDelegate) {
      const options = context.getBehaviorOptions<{ label?: string }>(
        LoggingBehavior,
      );
      order.push(`${tag}:${options?.label ?? 'none'}`);
      return next();
    }
  }
  return LoggingBehavior;
}

const FirstLogging = makeNamedBehavior('first');
const SecondLogging = makeNamedBehavior('second');

class DoThingCommand {}

@CommandHandler(DoThingCommand)
@UsePipeline([FirstLogging, { label: 'a' }], [SecondLogging, { label: 'b' }])
class DoThingHandler {
  async execute() {
    return 'done';
  }
}

describe('pipeline behavior identity', () => {
  beforeEach(() => {
    order.length = 0;
  });

  it('runs both same-named behaviors with their own options', async () => {
    expect(FirstLogging.name).toBe(SecondLogging.name);

    const app = createCqrs({
      bootstrapLogLevel: 'none',
      behaviors: [new FirstLogging(), new SecondLogging()],
    });
    app.register(new DoThingHandler());

    try {
      await app.commandBus.execute(new DoThingCommand());
      expect(order).toEqual(['first:a', 'second:b']);
    } finally {
      await app.close();
    }
  });
});
