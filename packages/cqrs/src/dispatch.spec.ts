/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type Constructor,
  type IPipelineBehavior,
  type IPipelineBehaviorContract,
  type IPipelineContext,
  type NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
  type PipelineBehaviorDiagnostic,
} from '@cqrs-ddd/pipeline';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CommandHandler,
  EventsHandler,
  QueryHandler,
  SkipPipeline,
  UsePipeline,
} from './decorators.js';
import { type PipelineSettings, toDispatch } from './dispatch.js';

const trail: string[] = [];

function recorder(label: string) {
  return class implements IPipelineBehavior {
    async handle(context: IPipelineContext, next: NextDelegate) {
      trail.push(
        `${label} ${context.requestKind} ${context.handlerName} ${context.requestName}`,
      );
      return next();
    }
  };
}

const Logging = recorder('logging');
const Audit = recorder('audit');
const Trace = recorder('trace');

class Keyed implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    validate: (context) =>
      context.effectiveOptions?.key
        ? undefined
        : [
            {
              handlerName: context.handlerName,
              behaviorName: 'Keyed',
              message: 'needs a key',
              fix: 'pass one',
            },
          ],
  };
  async handle(context: IPipelineContext, next: NextDelegate) {
    trail.push(`keyed ${context.getBehaviorOptions(Keyed)?.key}`);
    return next();
  }
}

class CreateUser {
  constructor(readonly name: string) {}
}
class GetUser {}
class UserCreated {}

const settings = (extra: Partial<PipelineSettings> = {}): PipelineSettings => ({
  behavior: (type: Constructor<IPipelineBehavior>) => new type(),
  ...extra,
});

beforeEach(() => {
  trail.length = 0;
});

describe('toDispatch', () => {
  it('runs the handler with itself as receiver when no behavior applies', async () => {
    @CommandHandler(CreateUser)
    class CreateUserHandler {
      readonly prefix = 'created';
      async execute(command: CreateUser) {
        return `${this.prefix} ${command.name}`;
      }
    }
    const run = toDispatch(
      CreateUserHandler,
      () => new CreateUserHandler(),
      'command',
      settings(),
    );
    await expect(run(new CreateUser('ann'))).resolves.toBe('created ann');
    expect(trail).toEqual([]);
  });

  it('places global before, declared, then global after behaviors, named after the handler class', async () => {
    @QueryHandler(GetUser)
    @UsePipeline(Audit, [Keyed, { key: 'users' }])
    class GetUserHandler {
      async execute() {
        trail.push('handler');
        return 'u-1';
      }
    }
    const run = toDispatch(
      GetUserHandler,
      () => new GetUserHandler(),
      'query',
      settings({
        globalBehaviors: [
          { before: [Logging], after: [Trace] },
          { scope: 'commands', before: [Audit] },
        ],
      }),
    );
    await expect(run(new GetUser())).resolves.toBe('u-1');
    expect(trail).toEqual([
      'logging query GetUserHandler GetUser',
      'audit query GetUserHandler GetUser',
      'keyed users',
      'trace query GetUserHandler GetUser',
      'handler',
    ]);
  });

  it("calls an events handler's handle and leaves out the global behaviors it skips", async () => {
    @EventsHandler(UserCreated)
    @SkipPipeline(Logging)
    class Welcome {
      async handle(event: UserCreated) {
        trail.push(`welcome ${event.constructor.name}`);
      }
    }
    const run = toDispatch(
      Welcome,
      () => new Welcome(),
      'event',
      settings({ globalBehaviors: { before: [Logging, Trace] } }),
    );
    await run(new UserCreated());
    expect(trail).toEqual([
      'trace event Welcome UserCreated',
      'welcome UserCreated',
    ]);
  });

  it('runs inside the tenant of the configured source', async () => {
    let seen: string | undefined;
    class Tenant implements IPipelineBehavior {
      async handle(context: IPipelineContext, next: NextDelegate) {
        seen = context.tenantId;
        return next();
      }
    }
    @CommandHandler(CreateUser)
    @UsePipeline(Tenant)
    class Handler {
      async execute() {}
    }
    const tenantId = {
      current: () => 't-1',
      run: <T>(_: unknown, fn: () => T) => fn(),
    };
    await toDispatch(
      Handler,
      () => new Handler(),
      'command',
      settings({ sources: { tenantId } }),
    )(new CreateUser('ann'));
    expect(seen).toBe('t-1');
  });

  it('reports contract violations to the diagnostics it is given, and checks none otherwise', () => {
    @CommandHandler(CreateUser)
    @UsePipeline(Keyed)
    class Handler {
      async execute() {}
    }
    const diagnostics: PipelineBehaviorDiagnostic[] = [];
    toDispatch(
      Handler,
      () => new Handler(),
      'command',
      settings({ diagnostics }),
    );
    expect(diagnostics).toEqual([
      expect.objectContaining({
        handlerName: 'Handler',
        message: 'needs a key',
      }),
    ]);
    expect(() =>
      toDispatch(Handler, () => new Handler(), 'command', settings()),
    ).not.toThrow();
  });

  it('refuses a behavior that a handler both declares and skips', () => {
    @CommandHandler(CreateUser)
    @UsePipeline(Audit)
    @SkipPipeline(Audit)
    class Handler {
      async execute() {}
    }
    expect(() =>
      toDispatch(Handler, () => new Handler(), 'command', settings()),
    ).toThrow('Handler Handler has contradictory pipeline configuration');
  });

  it('refuses a handler without the method of its kind', () => {
    class Empty {}
    expect(() =>
      toDispatch(Empty, () => new Empty(), 'command', settings()),
    ).toThrow("@CommandHandler and contains an 'execute' method.");
    expect(() =>
      toDispatch(Empty, () => new Empty(), 'query', settings()),
    ).toThrow("@QueryHandler and contains an 'execute' method.");
    expect(() =>
      toDispatch(
        class Commandish {
          async execute() {}
        },
        () => ({}),
        'event',
        settings(),
      ),
    ).toThrow("@EventsHandler and contains a 'handle' method.");
  });
});
