/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { UserUpdatedEvent } from '../../../domain/events/user-updated.event.js';
import { User } from '../../../domain/models/user.entity.js';
import type { IUserBatchDispatcher } from '../../ports/user-event-dispatcher.port.js';
import { UserUpdatedHandler } from './user-updated.handler.js';

describe('UserUpdatedHandler', () => {
  it('dispatches only application data; logging/correlation are cross-cutting concerns', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const dispatcher = { enqueue } as IUserBatchDispatcher;
    const handler = new UserUpdatedHandler(dispatcher);

    const user = User.create('john_doe', 'john@example.com');
    user.commit();
    user.update({ username: 'john_renamed' });
    const [event] = user.getUncommittedEvents() as [UserUpdatedEvent];

    await handler.handle(event);

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith([
      {
        userId: user.id,
        username: 'john_renamed',
      },
    ]);
  });
});
