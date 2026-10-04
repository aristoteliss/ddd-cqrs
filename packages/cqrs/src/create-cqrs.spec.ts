/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type IPipelineBehavior,
  type IPipelineBehaviorContract,
  type IPipelineContext,
  LoggingBehavior,
  type NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
  PipelineConfigurationError,
  type PipelineLogger,
  UsePipeline,
} from '@cqrs-ddd/pipeline';
import { describe, expect, it, vi } from 'vitest';
import { createCqrs } from './create-cqrs.js';
import { CommandHandler, EventsHandler, QueryHandler } from './decorators.js';
import type { EventBus } from './event.bus.js';

class CreateUser {
  constructor(readonly name: string) {}
}
class GetUser {
  constructor(readonly id: string) {}
}
class UserCreated {
  constructor(readonly id: string) {}
}

const trail: string[] = [];

class Audit implements IPipelineBehavior {
  constructor(private readonly label: string) {}
  async handle(context: IPipelineContext, next: NextDelegate) {
    trail.push(`${this.label} ${context.handlerName}`);
    return next();
  }
}

@CommandHandler(CreateUser)
@UsePipeline(Audit)
class CreateUserHandler {
  constructor(
    private readonly users: string[],
    private readonly events: EventBus,
  ) {}
  async execute(command: CreateUser) {
    this.users.push(command.name);
    const id = `u-${this.users.length}`;
    this.events.publish(new UserCreated(id));
    return id;
  }
}

@QueryHandler(GetUser)
class GetUserHandler {
  constructor(private readonly users: string[]) {}
  async execute(query: GetUser) {
    return this.users[Number(query.id.slice(2)) - 1];
  }
}

@EventsHandler(UserCreated)
class Welcome {
  async handle(event: UserCreated) {
    await Promise.resolve();
    trail.push(`welcome ${event.id}`);
  }
}

const quiet = (): PipelineLogger => ({
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
});

describe('createCqrs', () => {
  it('runs registered handlers through their pipelines, with given behavior instances, and drains events on close', async () => {
    trail.length = 0;
    const logger = quiet();
    const cqrs = createCqrs({
      behaviors: [new Audit('audited')],
      globalBehaviors: { before: [LoggingBehavior] },
      logger,
    });
    const users: string[] = [];
    cqrs.register(
      new CreateUserHandler(users, cqrs.eventBus),
      new GetUserHandler(users),
      new Welcome(),
    );

    const id = await cqrs.commandBus.execute<CreateUser, string>(
      new CreateUser('ann'),
    );
    await expect(cqrs.queryBus.execute(new GetUser(id))).resolves.toBe('ann');
    await cqrs.close();

    expect(trail).toEqual(['audited CreateUserHandler', 'welcome u-1']);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('COMMAND CreateUser'),
      'CreateUserHandler',
    );
    expect(cqrs.unhandledExceptionBus).toBeDefined();
  });

  it('builds missing behaviors with new and logs to the console by default', async () => {
    trail.length = 0;
    class Counted implements IPipelineBehavior {
      async handle(_context: IPipelineContext, next: NextDelegate) {
        trail.push('counted');
        return next();
      }
    }
    @QueryHandler(GetUser)
    @UsePipeline(Counted)
    class Lookup {
      async execute() {
        return 'found';
      }
    }
    const cqrs = createCqrs();
    cqrs.register(new Lookup());

    await expect(cqrs.queryBus.execute(new GetUser('u-1'))).resolves.toBe(
      'found',
    );
    expect(trail).toEqual(['counted']);
  });

  it('refuses two instances of one behavior class, and an undecorated handler', () => {
    expect(() =>
      createCqrs({ behaviors: [new Audit('a'), new Audit('b')] }),
    ).toThrow(
      'createCqrs: two instances of Audit; pass one per behavior class.',
    );

    class Plain {
      async execute() {}
    }
    expect(() => createCqrs().register(new Plain())).toThrow(
      'Plain has no @CommandHandler, @QueryHandler or @EventsHandler decorator.',
    );
  });

  it('throws a failed event handler as an uncaught exception with rethrowUnhandled', async () => {
    vi.useFakeTimers();
    const failure = new Error('smtp down');
    @EventsHandler(UserCreated)
    class Failing {
      async handle() {
        throw failure;
      }
    }
    const cqrs = createCqrs({ rethrowUnhandled: true, logger: quiet() });
    cqrs.register(new Failing());

    cqrs.eventBus.publish(new UserCreated('u-1'));
    await cqrs.close();
    expect(() => vi.runAllTimers()).toThrow(failure);
    vi.useRealTimers();
  });

  it('builds global behaviors at creation, so one that cannot be built fails there', () => {
    class NeedsClient implements IPipelineBehavior {
      constructor(client?: object) {
        if (!client) throw new TypeError('NeedsClient needs a client.');
      }
      async handle(_context: IPipelineContext, next: NextDelegate) {
        return next();
      }
    }
    expect(() =>
      createCqrs({ globalBehaviors: { after: [NeedsClient] } }),
    ).toThrow('NeedsClient needs a client.');
  });

  it('refuses a second handler of one command', () => {
    @CommandHandler(CreateUser)
    class Other {
      async execute() {}
    }
    const cqrs = createCqrs();
    cqrs.register(new CreateUserHandler([], cqrs.eventBus));
    expect(() => cqrs.register(new Other())).toThrow(
      'CreateUser has a second command handler, Other; a command has exactly one.',
    );
  });

  it('logs the startup line at bootstrapLogLevel, and not with none', () => {
    const logger = quiet();
    const globalBehaviors = { before: [LoggingBehavior] };
    createCqrs({ logger, globalBehaviors, bootstrapLogLevel: 'warn' }).register(
      new GetUserHandler([]),
    );
    createCqrs({ logger, globalBehaviors, bootstrapLogLevel: 'none' }).register(
      new GetUserHandler([]),
    );
    createCqrs({ logger, globalBehaviors }).register(new GetUserHandler([]));

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Wrapping GetUserHandler.execute() [query]'),
    );
  });

  describe('contract diagnostics', () => {
    class Keyed implements IPipelineBehavior {
      static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract =
        {
          validate: (context) => [
            {
              handlerName: context.handlerName,
              behaviorName: 'Keyed',
              message: 'needs a key',
              fix: 'pass one',
            },
          ],
        };
      async handle(_context: IPipelineContext, next: NextDelegate) {
        return next();
      }
    }
    @CommandHandler(CreateUser)
    @UsePipeline(Keyed)
    class Keyless {
      async execute() {}
    }

    it('throw by default', () => {
      expect(() => createCqrs().register(new Keyless())).toThrow(
        PipelineConfigurationError,
      );
    });

    it('are logged with warn, and not checked with off', () => {
      const logger = quiet();
      createCqrs({ diagnostics: 'warn', logger }).register(new Keyless());
      expect(logger.warn).toHaveBeenCalledWith(
        "[Pipeline Diagnostic] Handler 'Keyless' with behavior 'Keyed': needs a key. Fix: pass one",
      );
      expect(() =>
        createCqrs({ diagnostics: 'off' }).register(new Keyless()),
      ).not.toThrow();
    });
  });
});
