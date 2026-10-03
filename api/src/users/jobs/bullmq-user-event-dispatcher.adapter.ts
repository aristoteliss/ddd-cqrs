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
 * BullMQ infrastructure adapter for user-event application dispatch ports.
 * Both queues stamp the caller's tenant, correlation id and principal into the
 * job payload with `withJobContext`; the processors restore them with
 * `@InJobContext`.
 */
export class BullMqUserEventDispatcher
  implements IWelcomeEmailDispatcher, IUserBatchDispatcher
{
  constructor(
    private readonly welcomeEmailQueue: Queue<WelcomeEmailJobData>,
    private readonly batchUpdateQueue: Queue<BatchUpdateUsersJobData>,
  ) {}

  async enqueueWelcomeEmail(message: WelcomeEmailDispatch): Promise<void> {
    await this.welcomeEmailQueue.add('send', withJobContext(message));
  }

  async enqueueUserBatch(
    items: readonly UserBatchDispatchItem[],
  ): Promise<void> {
    await this.batchUpdateQueue.add(
      'batch-update',
      withJobContext({ items: items.map((item) => ({ ...item })) }),
    );
  }
}
