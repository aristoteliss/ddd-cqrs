/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { getCorrelationId } from '@cqrs-ddd/pipeline-correlation';
import {
  InJobContext,
  type WithJobContext,
} from '@cqrs-ddd/pipeline-job-context';
import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import type { TenantSchemaContext } from '../../persistence/tenant-schema.context.js';

export const WELCOME_EMAIL_QUEUE = 'welcome-email';

export type WelcomeEmailJobData = WithJobContext<{
  userId: string;
  username: string;
  email: string;
}>;

export interface SimulatedWelcomeEmailResult {
  readonly simulated: true;
  readonly emailSent: false;
  readonly recipient: string;
  readonly userId: string;
}

export class SendWelcomeEmailProcessor {
  constructor(
    private readonly tenantContext: TenantSchemaContext,
    private readonly logger: Pick<Logger, 'info'>,
  ) {}

  @InJobContext()
  async process(
    job: Job<WelcomeEmailJobData>,
  ): Promise<SimulatedWelcomeEmailResult> {
    this.logger.info(
      `[Simulated] Demonstrating welcome email dispatch for ${job.data.email} ` +
        `(user: ${job.data.username}, tenant: ${this.tenantContext.schema}, correlationId: ${getCorrelationId()}). No external email sent.`,
    );

    return {
      simulated: true,
      emailSent: false,
      recipient: job.data.email,
      userId: job.data.userId,
    };
  }
}
