/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EventsHandler, type IEventHandler } from '@cqrs-ddd/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { deadLetter } from '@cqrs-ddd/pipeline-deadletter';
import { UserCreatedEvent } from '../../../domain/events/user-created.event.js';
import { type IWelcomeEmailDispatcher } from '../../ports/user-event-dispatcher.port.js';

@EventsHandler(UserCreatedEvent)
@UsePipeline(deadLetter({ rethrow: false }))
export class UserCreatedHandler implements IEventHandler<UserCreatedEvent> {
  constructor(
    private readonly welcomeEmailDispatcher: IWelcomeEmailDispatcher,
  ) {}

  async handle(event: UserCreatedEvent): Promise<void> {
    const { id: userId, username, email } = event.payload;

    await this.welcomeEmailDispatcher.enqueueWelcomeEmail({
      userId,
      username,
      email,
    });
  }
}
