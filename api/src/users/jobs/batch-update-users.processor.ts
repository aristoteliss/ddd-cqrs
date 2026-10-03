/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { getCorrelationId } from '@cqrs-ddd/pipeline-correlation';
import {
  InJobContext,
  type WithJobContext,
} from '@cqrs-ddd/pipeline-job-context';
import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import type { TenantSchemaContext } from '../../persistence/tenant-schema.context.js';

export const BATCH_UPDATE_USERS_QUEUE = 'batch-update-users';

export interface BatchUpdateUserItem {
  userId: string;
  username?: string;
  email?: string;
}

/**
 * Batch job payload. The items are wrapped in an object so the job context
 * travels beside them; one batch runs in one tenant.
 */
export type BatchUpdateUsersJobData = WithJobContext<{
  items: BatchUpdateUserItem[];
}>;

export interface SimulatedBatchUpdateResult {
  readonly simulated: true;
  readonly rowsUpdated: 0;
  readonly itemCount: number;
}

export class BatchUpdateUsersProcessor {
  constructor(
    private readonly tenantContext: TenantSchemaContext,
    private readonly logger: Pick<Logger, 'info'>,
  ) {}

  @InJobContext()
  async process(
    job: Job<BatchUpdateUsersJobData>,
    _token?: string,
  ): Promise<SimulatedBatchUpdateResult> {
    const items = job.data.items;
    this.logger.info(
      `[Simulated] Demonstrating batch update for ${items.length} users ` +
        `(tenant: ${this.tenantContext.schema}, correlationId: ${getCorrelationId()}). No database rows updated.`,
    );
    return {
      simulated: true,
      rowsUpdated: 0,
      itemCount: items.length,
    };
  }
}
