/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { withJobContext } from '@cqrs-ddd/pipeline-job-context';
import type { Queue } from 'bullmq';
import type {
  IUserBatchDispatcher,
  IWelcomeEmailDispatcher,
  UserBatchDispatchItem,
  WelcomeEmailDispatch,
} from '../application/ports/user-event-dispatcher.port.js';
import type { BatchUpdateUsersJobData } from './batch-update-users.processor.js';
import type { WelcomeEmailJobData } from './send-welcome-email.processor.js';

/**
 * BullMQ adapter of `IWelcomeEmailDispatcher`. It stamps the caller's tenant,
 * correlation id and principal into the job payload with `withJobContext`; the
 * processor restores them with `@InJobContext`.
 */
export class BullMqWelcomeEmailDispatcher implements IWelcomeEmailDispatcher {
  constructor(private readonly queue: Queue<WelcomeEmailJobData>) {}

  async enqueue(message: WelcomeEmailDispatch): Promise<void> {
    await this.queue.add('send', withJobContext(message));
  }
}

/**
 * BullMQ adapter of `IUserBatchDispatcher`. It stamps the caller's tenant,
 * correlation id and principal beside the batch items with `withJobContext`; the
 * processor restores them with `@InJobContext`.
 */
export class BullMqUserBatchDispatcher implements IUserBatchDispatcher {
  constructor(private readonly queue: Queue<BatchUpdateUsersJobData>) {}

  async enqueue(items: readonly UserBatchDispatchItem[]): Promise<void> {
    await this.queue.add(
      'batch-update',
      withJobContext({ items: items.map((item) => ({ ...item })) }),
    );
  }
}
