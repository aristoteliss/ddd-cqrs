/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createPipeline } from '@cqrs-ddd/pipeline';
import { AuditBehavior, type AuditRecord } from '@cqrs-ddd/pipeline-audit';

/** The audit records of every command, kept in memory. */
export const auditTrail: AuditRecord[] = [];

/** The pipeline that audits every command of the example. */
export const pipeline = createPipeline({
  behaviors: [
    new AuditBehavior({ write: (record) => void auditTrail.push(record) }),
  ],
});
