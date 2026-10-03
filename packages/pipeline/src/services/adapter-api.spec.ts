/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import type {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface.js';
import type { IPipelineContext } from '../interfaces/pipeline.context.interface.js';
import {
  type IPipelineBehaviorContract,
  PIPELINE_BEHAVIOR_CONTRACT,
  type PipelineBehaviorDiagnostic,
} from '../interfaces/pipeline-behavior-contract.interface.js';
import { validateBehaviorContracts } from './pipeline-contracts.js';
import { compilePipelinePlan } from './pipeline-plan.js';
import { createPipelineRunner } from './pipeline-runner.js';

class First implements IPipelineBehavior {
  handle(_c: IPipelineContext, next: NextDelegate) {
    return next();
  }
}
class Second implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    order: { before: [First] },
  };
  handle(_c: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

describe('adapter API: compilePipelinePlan', () => {
  it('compiles a declaration that has only global behaviors', () => {
    const plan = compilePipelinePlan({
      handlerName: 'Handler',
      requestKind: 'unknown',
      skippedBehaviorTypes: [Second],
      globalBehaviors: { before: [First, Second] },
    });

    expect(plan.behaviorTypes).toEqual([First]);
    expect(plan.hasPipeline).toBe(true);
    expect(plan.mergedOptions.size).toBe(0);
  });

  it('takes handler options as they are for a behavior without global options', () => {
    const plan = compilePipelinePlan({
      handlerName: 'Handler',
      requestKind: 'query',
      handlerBehaviorTypes: [First],
      handlerOptions: new Map([[First, { ttl: 5 }]]),
    });

    expect(plan.mergedOptions.get(First)).toEqual({ ttl: 5 });
  });
});

describe('adapter API: validateBehaviorContracts', () => {
  it('checks a before-only order rule for behaviors declared only globally', () => {
    const plan = compilePipelinePlan({
      handlerName: 'Handler',
      requestKind: 'command',
      globalBehaviors: { before: [First, Second] },
    });
    const diagnostics: PipelineBehaviorDiagnostic[] = [];
    validateBehaviorContracts({
      ...plan,
      handlerType: class Handler {},
      handlerName: 'Handler',
      requestKind: 'command',
      resolvedBehaviors: new Map(),
      diagnostics,
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        handlerName: 'Handler',
        behaviorName: 'Second',
        message: expect.stringContaining('must execute before it'),
      }),
    ]);
  });
});

describe('adapter API: createPipelineRunner', () => {
  it('resolves the behaviors per execution when given a resolver', async () => {
    const seen: unknown[] = [];
    const run = createPipelineRunner(
      function (this: unknown, request: unknown) {
        return { self: this, request };
      },
      {
        handlerType: class Handler {},
        handlerName: 'Handler',
        requestKind: 'command',
      },
      async (self, request) => {
        seen.push([self, request]);
        return [new First()];
      },
      true,
    );

    await expect(run('host', 'req')).resolves.toEqual({
      self: 'host',
      request: 'req',
    });
    expect(seen).toEqual([['host', 'req']]);
  });
});
