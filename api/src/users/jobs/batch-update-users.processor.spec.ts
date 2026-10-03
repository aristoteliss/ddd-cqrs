/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { runWithCorrelationId } from '@cqrs-ddd/pipeline-correlation';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { TenantSchemaContext } from '../../persistence/tenant-schema.context.js';
import {
  type BatchUpdateUsersJobData,
  BatchUpdateUsersProcessor,
} from './batch-update-users.processor.js';

vi.mock('@cqrs-ddd/pipeline-job-context', () => ({
  InJobContext: () => () => undefined,
}));

const tenantContext = { schema: 'tenant_a' } as TenantSchemaContext;

describe('BatchUpdateUsersProcessor', () => {
  it('logs the active tenant and correlation id and updates no rows', async () => {
    let observed: string | undefined;
    const processor = new BatchUpdateUsersProcessor(tenantContext, {
      info: (message: string) => {
        observed ??= message;
      },
    } as never);

    const result = await runWithCorrelationId('corr-batch', () =>
      processor.process({
        data: { items: [{ userId: 'user-a' }] },
      } as unknown as Job<BatchUpdateUsersJobData>),
    );

    expect(observed).toContain('tenant: tenant_a');
    expect(observed).toContain('corr-batch');
    expect(observed).toContain('No database rows updated');
    expect(result).toEqual({
      simulated: true,
      rowsUpdated: 0,
      itemCount: 1,
    });
  });
});
