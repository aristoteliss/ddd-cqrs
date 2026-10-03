/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  BaseCommand,
  BaseQuery,
  CommandBaseHandler,
} from '@cqrs-ddd/core/application';
import { AggregateRoot, DomainEvent } from '@cqrs-ddd/core/domain';
import {
  CommandHandler,
  createCqrs,
  EventBus,
  EventPublisher,
  EventsHandler,
  QueryHandler,
} from '@cqrs-ddd/cqrs';
import type {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@cqrs-ddd/pipeline';
import { afterEach, describe, expect, it } from 'vitest';

class RenameUserCommand extends BaseCommand {
  constructor(
    readonly id: string,
    readonly name: string,
  ) {
    super();
  }
}

class InviteUserCommand extends BaseCommand {
  constructor(readonly name: string) {
    super();
  }
}

class GetUserQuery extends BaseQuery {
  constructor(readonly id: string) {
    super();
  }
}

class UserRenamedEvent extends DomainEvent {
  constructor(readonly name: string) {
    super();
  }
}

class User extends AggregateRoot {
  rename(name: string): this {
    this.apply(new UserRenamedEvent(name));
    return this;
  }
}

const trace: string[] = [];
const correlations = new Map<string, string>();

class Tracing implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate) {
    correlations.set(context.requestName, context.correlationId);
    trace.push(`start ${context.requestKind} ${context.handlerName}`);
    const result = await next();
    trace.push(`end ${context.handlerName}`);
    return result;
  }
}

@CommandHandler(RenameUserCommand)
class RenameUserHandler extends CommandBaseHandler<RenameUserCommand, User> {
  constructor(eventBus: EventBus) {
    super(eventBus);
  }

  async handle(command: RenameUserCommand): Promise<User> {
    return new User().rename(command.name);
  }
}

@CommandHandler(InviteUserCommand)
class InviteUserHandler {
  constructor(private readonly publisher: EventPublisher) {}

  async execute(command: InviteUserCommand) {
    this.publisher.mergeObjectContext(new User()).rename(command.name).commit();
  }
}

@QueryHandler(GetUserQuery)
class GetUserHandler {
  async execute(query: GetUserQuery) {
    return { id: query.id };
  }
}

@EventsHandler(UserRenamedEvent)
class Notify {
  async handle(event: UserRenamedEvent) {
    trace.push(`notify ${event.name}`);
  }
}

async function start() {
  const cqrs = createCqrs({
    globalBehaviors: { before: [Tracing] },
    bootstrapLogLevel: 'none',
  });
  cqrs.register(
    new RenameUserHandler(cqrs.eventBus),
    new InviteUserHandler(cqrs.eventPublisher),
    new GetUserHandler(),
    new Notify(),
  );
  return cqrs;
}

afterEach(() => {
  trace.length = 0;
  correlations.clear();
});

describe('@cqrs-ddd/core through the @cqrs-ddd/cqrs buses', () => {
  it("publishes a CommandBaseHandler's aggregate events through the EventBus, inside the command's correlation", async () => {
    const app = await start();
    const user = await app.commandBus.execute<RenameUserCommand, User>(
      new RenameUserCommand('u-1', 'Ann'),
    );
    await app.close();

    expect(user.getUncommittedEvents()).toEqual([]);
    expect(trace.slice(0, 3)).toEqual([
      'start command RenameUserHandler',
      'start event Notify',
      'notify Ann',
    ]);
    expect(trace.slice(3).sort()).toEqual([
      'end Notify',
      'end RenameUserHandler',
    ]);
    expect(correlations.get('UserRenamedEvent')).toBe(
      correlations.get('RenameUserCommand'),
    );
  });

  it('publishes on commit() an aggregate merged with the EventPublisher', async () => {
    const app = await start();
    await app.commandBus.execute(new InviteUserCommand('Bob'));
    await app.close();

    expect(trace).toContain('notify Bob');
  });

  it('runs a BaseQuery through its handler and pipeline', async () => {
    const app = await start();
    await expect(
      app.queryBus.execute(new GetUserQuery('u-1')),
    ).resolves.toEqual({ id: 'u-1' });
    expect(trace).toEqual(['start query GetUserHandler', 'end GetUserHandler']);
    await app.close();
  });
});
