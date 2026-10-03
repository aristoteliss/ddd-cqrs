/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@cqrs-ddd/pipeline';
import { TraceBehavior, type TraceBehaviorOptions } from '../trace.behavior.js';

export type TraceIntentOptions = TraceBehaviorOptions;

/**
 * Returns a trace behavior entry for `pipeline.wrap()` or `createPipeline({ globalBehaviors })`.
 * @param options Per-handler trace options; omitted fields use behavior defaults.
 * @returns The behavior class and options tuple.
 * @example
 * ```ts
 * @pipeline.wrap({ kind: 'query' }, trace({ tracerName: 'users-api' }))
 * ```
 */
export function trace(
  options: TraceIntentOptions = {},
): PipelineBehaviorTuple<TraceBehavior, TraceBehaviorOptions> {
  return [TraceBehavior, options];
}
