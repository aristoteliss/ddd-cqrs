/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { runWithCorrelationId } from '@cqrs-ddd/pipeline-correlation';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { TenantSchemaContext } from '../../persistence/tenant-schema.context.js';
import {
  SendWelcomeEmailProcessor,
  type WelcomeEmailJobData,
} from './send-welcome-email.processor.js';

vi.mock('@cqrs-ddd/pipeline-job-context', () => ({
  InJobContext: () => () => undefined,
}));

const tenantContext = { schema: 'tenant_alpha' } as TenantSchemaContext;

describe('SendWelcomeEmailProcessor', () => {
  it('demonstrates welcome email job execution without sending external emails', async () => {
    const logs: string[] = [];
    const processor = new SendWelcomeEmailProcessor(tenantContext, {
      info: (message: string) => void logs.push(message),
    } as never);
    const job = {
      data: {
        userId: 'u-1',
        username: 'alice',
        email: 'alice@example.test',
      },
    } as unknown as Job<WelcomeEmailJobData>;

    const result = await runWithCorrelationId('corr-welcome-1', () =>
      processor.process(job),
    );

    expect(result).toEqual({
      simulated: true,
      emailSent: false,
      recipient: 'alice@example.test',
      userId: 'u-1',
    });
    expect(logs).toEqual([
      expect.stringContaining(
        'Demonstrating welcome email dispatch for alice@example.test',
      ),
    ]);
    expect(logs[0]).toContain('tenant: tenant_alpha');
    expect(logs[0]).toContain('corr-welcome-1');
    expect(logs[0]).toContain('No external email sent');
  });
});
