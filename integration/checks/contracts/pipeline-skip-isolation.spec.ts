/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { CommandHandler, type Cqrs, createCqrs } from '@cqrs-ddd/cqrs';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  pipelineStore,
  SkipPipeline,
} from '@cqrs-ddd/pipeline';
import { describe, expect, it } from 'vitest';

class IsolatedCommand {}

class SkippedBehavior implements IPipelineBehavior {
  async handle(_context: IPipelineContext, next: NextDelegate) {
    return { unexpected: await next() };
  }
}

class MarkerBehavior implements IPipelineBehavior {
  async handle(_context: IPipelineContext, next: NextDelegate) {
    return { marker: true, result: await next() };
  }
}

@CommandHandler(IsolatedCommand)
@SkipPipeline(SkippedBehavior)
class SharedHandler {
  async execute() {
    return { value: 'handler', hasContext: Boolean(pipelineStore.getStore()) };
  }
}

function start(marked: boolean): Cqrs {
  const cqrs = createCqrs({
    bootstrapLogLevel: 'none',
    globalBehaviors: {
      before: marked ? [SkippedBehavior, MarkerBehavior] : [SkippedBehavior],
    },
  });
  cqrs.register(new SharedHandler());
  return cqrs;
}

const execute = (app: Cqrs) => app.commandBus.execute(new IsolatedCommand());
const markedResult = {
  marker: true,
  result: { value: 'handler', hasContext: true },
};
const skippedResult = { value: 'handler', hasContext: false };

describe('SkipPipeline application isolation', () => {
  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])(
    'isolates two applications of one handler class (marked first: %s, marked closes first: %s)',
    async (markedFirst, closeMarkedFirst) => {
      const first = start(markedFirst);
      let second: Cqrs | undefined;
      let closed: Cqrs | undefined;
      try {
        expect(await execute(first)).toEqual(
          markedFirst ? markedResult : skippedResult,
        );
        second = start(!markedFirst);
        const marked = markedFirst ? first : second;
        const skipped = markedFirst ? second : first;
        expect(await execute(marked)).toEqual(markedResult);
        expect(await execute(skipped)).toEqual(skippedResult);
        closed = closeMarkedFirst ? marked : skipped;
        await closed.close();
        expect(await execute(closeMarkedFirst ? skipped : marked)).toEqual(
          closeMarkedFirst ? skippedResult : markedResult,
        );
      } finally {
        if (second && second !== closed) await second.close();
        if (first !== closed) await first.close();
      }
    },
  );
});
