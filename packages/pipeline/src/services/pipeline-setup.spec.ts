/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { SkipPipeline, UsePipeline } from '../handler-pipeline.js';
import type {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface.js';
import type { IPipelineContext } from '../interfaces/pipeline.context.interface.js';
import {
  behaviorDiagnostic,
  PIPELINE_BEHAVIOR_CONTRACT,
  type PipelineBehaviorDiagnostic,
  PipelineConfigurationError,
} from '../interfaces/pipeline-behavior-contract.interface.js';
import {
  compileHandlerPlan,
  createBehaviorResolver,
  createHandlerRunner,
  reportDiagnostics,
} from './pipeline-setup.js';

const calls: string[] = [];

class Outer implements IPipelineBehavior {
  handle(context: IPipelineContext, next: NextDelegate) {
    calls.push(`outer:${context.handlerName}:${context.requestKind}`);
    return next();
  }
}

class Keyed implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_CONTRACT] = {
    validate: ({ handlerName }: { handlerName: string }) => [
      {
        handlerName,
        behaviorName: 'Keyed',
        message: 'needs a key',
        fix: 'pass one',
      },
    ],
  };

  handle(context: IPipelineContext, next: NextDelegate) {
    calls.push(`keyed:${JSON.stringify(context.getBehaviorOptions(Keyed))}`);
    return next();
  }
}

@UsePipeline([Keyed, { ttl: 1 }])
class PriceHandler {
  execute(sku: string) {
    return `price of ${sku}`;
  }
}

@SkipPipeline(Outer)
class PlainHandler {
  handle() {
    return 'handled';
  }
}

const diagnostic: PipelineBehaviorDiagnostic = {
  handlerName: 'PriceHandler',
  behaviorName: 'Keyed',
  message: 'needs a key',
  fix: 'pass one',
};

describe('compileHandlerPlan', () => {
  it('places the global behaviors around the ones the handler declares', () => {
    const plan = compileHandlerPlan(PriceHandler, 'query', { before: [Outer] });

    expect(plan.behaviorTypes).toEqual([Outer, Keyed]);
  });

  it('leaves out the global behaviors the handler skips', () => {
    const plan = compileHandlerPlan(PlainHandler, 'event', { before: [Outer] });

    expect(plan.hasPipeline).toBe(false);
  });
});

describe('createHandlerRunner', () => {
  it('runs the method inside its behaviors, with the handler as the context', async () => {
    calls.length = 0;
    const log = vi.fn();
    const found: PipelineBehaviorDiagnostic[] = [];
    const plan = compileHandlerPlan(PriceHandler, 'query', { before: [Outer] });
    const run = createHandlerRunner({
      handlerType: PriceHandler,
      kind: 'query',
      plan,
      method: PriceHandler.prototype.execute,
      behaviors: [new Outer(), new Keyed()],
      diagnostics: found,
      log,
    });

    await expect(run(new PriceHandler(), 'a-1')).resolves.toBe('price of a-1');
    expect(calls).toEqual(['outer:PriceHandler:query', 'keyed:{"ttl":1}']);
    expect(log).toHaveBeenCalledWith(
      'Wrapping PriceHandler.execute() [query] with pipeline: [Outer → Keyed]',
    );
    expect(found).toEqual([diagnostic]);
  });

  it('calls a handler without behaviors directly, with no log line', async () => {
    const log = vi.fn();
    const run = createHandlerRunner({
      handlerType: PlainHandler,
      kind: 'event',
      plan: compileHandlerPlan(PlainHandler, 'event'),
      method: PlainHandler.prototype.handle,
      behaviors: [],
      log,
    });

    await expect(run(new PlainHandler(), {})).resolves.toBe('handled');
    expect(log).not.toHaveBeenCalled();
  });

  it('names the handle method of an event handler', () => {
    const log = vi.fn();
    createHandlerRunner({
      handlerType: PlainHandler,
      kind: 'event',
      plan: compileHandlerPlan(PlainHandler, 'event', { after: [Keyed] }),
      method: PlainHandler.prototype.handle,
      behaviors: [new Keyed()],
      log,
    });

    expect(log).toHaveBeenCalledWith(
      'Wrapping PlainHandler.handle() [event] with pipeline: [Keyed]',
    );
  });
});

describe('reportDiagnostics', () => {
  it('throws the violations together in strict mode', () => {
    expect(() => reportDiagnostics([diagnostic], 'strict', console)).toThrow(
      PipelineConfigurationError,
    );
  });

  it('logs each violation in warn mode', () => {
    const warn = vi.fn();
    reportDiagnostics([diagnostic], 'warn', { warn });

    expect(warn).toHaveBeenCalledWith(
      "[Pipeline Diagnostic] 'PriceHandler' with behavior 'Keyed': needs a key. Fix: pass one",
    );
  });

  it('does nothing in off mode, or with no violation', () => {
    const warn = vi.fn();
    reportDiagnostics([diagnostic], 'off', { warn });
    reportDiagnostics([], 'strict', { warn });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('createBehaviorResolver', () => {
  it('returns the given instance, and builds one instance of any other class', () => {
    const given = new Outer();
    const behavior = createBehaviorResolver({
      owner: 'test',
      given: [given],
      globalBehaviors: undefined,
      logger: console,
    });

    expect(behavior(Outer)).toBe(given);
    expect(behavior(Keyed)).toBe(behavior(Keyed));
  });
});

describe('behaviorDiagnostic', () => {
  it('names the handler under validation and the behavior that reports', () => {
    expect(
      behaviorDiagnostic({ handlerName: 'PriceHandler' }, 'Keyed', {
        message: 'needs a key',
        fix: 'pass one',
      }),
    ).toEqual([diagnostic]);
  });
});
