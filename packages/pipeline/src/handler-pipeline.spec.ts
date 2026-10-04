/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { pipelineOf, SkipPipeline, UsePipeline } from './handler-pipeline.js';
import type {
  IPipelineBehavior,
  NextDelegate,
} from './interfaces/pipeline.behavior.interface.js';
import type { IPipelineContext } from './interfaces/pipeline.context.interface.js';

class Audit implements IPipelineBehavior {
  async handle(_context: IPipelineContext, next: NextDelegate) {
    return next();
  }
}
class Trace implements IPipelineBehavior {
  async handle(_context: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

const standard = (name: string) =>
  ({ kind: 'class', name }) as ClassDecoratorContext;

describe('@UsePipeline and @SkipPipeline', () => {
  it('record the entries, their options and the skipped behaviors', () => {
    @UsePipeline(Audit, [Trace, { tracerName: 'users' }])
    @SkipPipeline(Audit)
    @SkipPipeline(Trace)
    class Handler {}

    const declared = pipelineOf(Handler);
    expect(declared.types).toEqual([Audit, Trace]);
    expect(declared.options.get(Trace)).toEqual({ tracerName: 'users' });
    expect(declared.skipped).toEqual([Trace, Audit]);
  });

  it('declare nothing when a handler has neither', () => {
    class Plain {}
    expect(pipelineOf(Plain)).toEqual({
      types: [],
      options: new Map(),
      skipped: [],
    });
  });

  it('name the handler in errors, in both decorator modes', () => {
    class Legacy {}
    class Modern {}
    expect(() => UsePipeline({} as never)(Legacy)).toThrow(
      '@UsePipeline on Legacy, entry 0',
    );
    expect(() =>
      SkipPipeline([Audit, {}] as never)(Modern, standard('Renamed')),
    ).toThrow('@SkipPipeline on Renamed, entry 0');
  });
});

describe('pipelineOf', () => {
  it('gives a subclass its parent declaration until it declares its own', () => {
    @UsePipeline(Audit)
    class Parent {}
    class Inherits extends Parent {}
    @UsePipeline(Trace)
    class Redeclares extends Parent {}

    expect(pipelineOf(Inherits).types).toEqual([Audit]);
    expect(pipelineOf(Redeclares).types).toEqual([Trace]);
    expect(pipelineOf(Parent).types).toEqual([Audit]);
  });
});
