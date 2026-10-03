/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EventsHandler, type IEventHandler } from '@cqrs-ddd/cqrs';
import { UserUpdatedEvent } from '../../../domain/events/user-updated.event.js';
import { type IUserBatchDispatcher } from '../../ports/user-event-dispatcher.port.js';

@EventsHandler(UserUpdatedEvent)
export class UserUpdatedHandler implements IEventHandler<UserUpdatedEvent> {
  constructor(private readonly userBatchDispatcher: IUserBatchDispatcher) {}

  async handle(event: UserUpdatedEvent): Promise<void> {
    const { id: userId, username } = event.payload;

    await this.userBatchDispatcher.enqueueUserBatch([{ userId, username }]);
  }
}
