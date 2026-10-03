/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  CommandHandler,
  type Cqrs,
  createCqrs,
  EventsHandler,
  UsePipeline,
} from '@cqrs-ddd/cqrs';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
} from '@cqrs-ddd/pipeline';
import { describe, expect, it, vi } from 'vitest';

class LabelBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate) {
    const label = context.getBehaviorOptions<{ label: string }>(
      LabelBehavior,
    )?.label;
    return [label, await next()];
  }
}

/** A behavior whose contract always reports a violation, failing strict registration. */
class InvalidBehavior implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_CONTRACT] = {
    validate: () => [
      {
        handlerName: 'BrokenHandler',
        behaviorName: 'InvalidBehavior',
        message: 'invalid',
        fix: 'configure',
      },
    ],
  };

  async handle(_context: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

class ParentCommand {}
class ChildCommand {}
class OverrideCommand {}
class BrokenCommand {}

@CommandHandler(ParentCommand)
@UsePipeline([LabelBehavior, { label: 'parent' }])
class ParentHandler {
  async execute(_request: object) {
    return 'done';
  }
}

@CommandHandler(ChildCommand)
@UsePipeline([LabelBehavior, { label: 'child' }])
class ChildHandler extends ParentHandler {}

@CommandHandler(OverrideCommand)
@UsePipeline([LabelBehavior, { label: 'override' }])
class OverrideHandler extends ParentHandler {
  async execute(request: object) {
    return super.execute(request);
  }
}

@CommandHandler(BrokenCommand)
@UsePipeline(InvalidBehavior)
class BrokenHandler {
  async execute() {
    return 'broken';
  }
}

function application(): Cqrs {
  return createCqrs({
    logger: { log() {}, warn() {}, error() {} },
    bootstrapLogLevel: 'none',
  });
}

describe('pipeline registration lifecycle', () => {
  it('leaves handler prototypes untouched when registration fails', async () => {
    const original = ParentHandler.prototype.execute;
    const app = application();
    try {
      expect(() =>
        app.register(new ParentHandler(), new BrokenHandler()),
      ).toThrow(/Pipeline configuration invalid/);
      expect(ParentHandler.prototype.execute).toBe(original);
      expect(Object.hasOwn(BrokenHandler.prototype, 'execute')).toBe(true);
    } finally {
      await app.close();
    }
  });

  it.each([false, true])(
    'uses each inherited handler chain regardless of registration order (child first: %s)',
    async (childFirst) => {
      const app = application();
      try {
        app.register(
          ...(childFirst
            ? [new ChildHandler(), new ParentHandler()]
            : [new ParentHandler(), new ChildHandler()]),
        );
        await expect(
          app.commandBus.execute(new ParentCommand()),
        ).resolves.toEqual(['parent', 'done']);
        await expect(
          app.commandBus.execute(new ChildCommand()),
        ).resolves.toEqual(['child', 'done']);
      } finally {
        await app.close();
      }
      expect(Object.hasOwn(ChildHandler.prototype, 'execute')).toBe(false);
    },
  );

  it('allows a handler override to call super without reentering its pipeline', async () => {
    const app = application();
    try {
      app.register(new ParentHandler(), new OverrideHandler());
      await expect(
        app.commandBus.execute(new OverrideCommand()),
      ).resolves.toEqual(['override', 'done']);
    } finally {
      await app.close();
    }
  });

  it('runs a repeated local behavior once with the last tuple options', async () => {
    class DuplicateCommand {}
    @CommandHandler(DuplicateCommand)
    @UsePipeline(
      [LabelBehavior, { label: 'first' }],
      [LabelBehavior, { label: 'last' }],
      LabelBehavior,
    )
    class DuplicateHandler {
      async execute() {
        return 'done';
      }
    }
    const app = application();
    try {
      app.register(new DuplicateHandler());
      await expect(
        app.commandBus.execute(new DuplicateCommand()),
      ).resolves.toEqual(['last', 'done']);
    } finally {
      await app.close();
    }
  });
});

describe('pipeline composition across applications and request kinds', () => {
  it('preserves the surviving application when another fails registration', async () => {
    const live = application();
    const failed = application();
    try {
      live.register(new ParentHandler());
      expect(() =>
        failed.register(new ParentHandler(), new BrokenHandler()),
      ).toThrow(/Pipeline configuration invalid/);
      await expect(
        live.commandBus.execute(new ParentCommand()),
      ).resolves.toEqual(['parent', 'done']);
    } finally {
      await failed.close();
      await live.close();
    }
  });

  it('keeps separate execute and handle runners on one handler instance', async () => {
    const observed: string[] = [];
    class KindBehavior implements IPipelineBehavior {
      async handle(context: IPipelineContext, next: NextDelegate) {
        observed.push(context.requestKind);
        return next();
      }
    }
    class DualCommand {}
    class DualEvent {}
    @CommandHandler(DualCommand)
    @EventsHandler(DualEvent)
    @UsePipeline(KindBehavior)
    class DualHandler {
      async execute() {
        observed.push('execute');
        return 'done';
      }
      async handle() {
        observed.push('handle');
      }
    }
    const app = application();
    try {
      app.register(new DualHandler());
      await expect(app.commandBus.execute(new DualCommand())).resolves.toBe(
        'done',
      );
      app.eventBus.publish(new DualEvent());
      await vi.waitFor(() =>
        expect(observed).toEqual(['command', 'execute', 'event', 'handle']),
      );
    } finally {
      await app.close();
    }
  });
});
