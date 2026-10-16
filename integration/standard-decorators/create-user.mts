/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  CommandHandler,
  createCqrs,
  type EventBus,
  EventsHandler,
  type ICommandHandler,
  type IEventHandler,
} from '@cqrs-ddd/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { validated, ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

class CreateUserCommand {
  constructor(readonly email: string) {}
}

class UserCreatedEvent {
  constructor(
    readonly id: string,
    readonly email: string,
  ) {}
}

@CommandHandler(CreateUserCommand)
@UsePipeline(validated(z.object({ email: z.email() })))
class CreateUserHandler implements ICommandHandler<CreateUserCommand, string> {
  constructor(
    private readonly users: Map<string, string>,
    private readonly events: EventBus,
  ) {}

  async execute(command: CreateUserCommand): Promise<string> {
    const id = `user_${this.users.size + 1}`;
    this.users.set(id, command.email);
    this.events.publish(new UserCreatedEvent(id, command.email));
    return id;
  }
}

@EventsHandler(UserCreatedEvent)
class WelcomeUser implements IEventHandler<UserCreatedEvent> {
  async handle(event: UserCreatedEvent): Promise<void> {
    console.log(`Welcome, ${event.email}`);
  }
}

const cqrs = createCqrs();
cqrs.register(
  new CreateUserHandler(new Map(), cqrs.eventBus),
  new WelcomeUser(),
);

const id = await cqrs.commandBus.execute<CreateUserCommand, string>(
  new CreateUserCommand('ada@example.com'),
);
console.log(`Created ${id}`);

try {
  await cqrs.commandBus.execute(new CreateUserCommand('not-an-email'));
} catch (error) {
  if (!(error instanceof ZodValidationError)) throw error;
  console.log('Invalid email rejected before the handler ran');
}

await cqrs.close();
