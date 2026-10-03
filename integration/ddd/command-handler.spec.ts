/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  BaseCommand,
  CommandBaseHandler,
  type IDomainEventPublisher,
} from '@cqrs-ddd/core/application';
import { AggregateRoot, DomainEvent } from '@cqrs-ddd/core/domain';
import {
  createPipeline,
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  pipelineStore,
} from '@cqrs-ddd/pipeline';
import { describe, expect, it } from 'vitest';

class RenameUserCommand extends BaseCommand {
  constructor(readonly name: string) {
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

class Tracing implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate) {
    trace.push(
      `start ${context.requestKind} ${context.requestName} ${context.handlerName}`,
    );
    const result = await next();
    trace.push('end');
    return result;
  }
}

const pipeline = createPipeline({ globalBehaviors: { before: [Tracing] } });

class RenameUserHandler extends CommandBaseHandler<RenameUserCommand, User> {
  constructor(eventBus: IDomainEventPublisher) {
    super(eventBus);
  }

  async handle(command: RenameUserCommand): Promise<User> {
    return new User().rename(command.name);
  }

  @pipeline.wrap()
  override async execute(command: RenameUserCommand): Promise<User> {
    return super.execute(command);
  }
}

describe('a CommandBaseHandler wrapped by a pipeline', () => {
  it('takes the kind and name from the command, and publishes the events inside the chain', async () => {
    trace.length = 0;
    const eventBus: IDomainEventPublisher = {
      publishAll: async (events) => {
        trace.push(
          `publish ${events.map((e) => e.constructor.name).join()} in pipeline ${pipelineStore.getStore() !== undefined}`,
        );
      },
    };

    const user = await new RenameUserHandler(eventBus).execute(
      new RenameUserCommand('Ann'),
    );

    expect(user.getUncommittedEvents()).toEqual([]);
    expect(trace).toEqual([
      'start command RenameUserCommand RenameUserHandler.execute',
      'publish UserRenamedEvent in pipeline true',
      'end',
    ]);
  });
});
