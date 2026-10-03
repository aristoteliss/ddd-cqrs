/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@cqrs-ddd/pipeline';
import { AuditBehavior } from '../audit.behavior.js';
import type { AuditBehaviorOptions } from '../interfaces/audit-options.interface.js';

export type AuditIntentOptions = AuditBehaviorOptions;

/**
 * Returns an audit behavior entry for `pipeline.wrap()` or `createPipeline({ globalBehaviors })`.
 * @param options Per-handler audit options; omitted fields use behavior defaults.
 * @returns The behavior class and options tuple.
 * @example
 * ```ts
 * @pipeline.wrap({ kind: 'command' }, audit({ action: 'user.delete', severity: 'high' }))
 * ```
 */
export function audit(
  options: AuditIntentOptions = {},
): PipelineBehaviorTuple<AuditBehavior, AuditBehaviorOptions> {
  return [AuditBehavior, options];
}
