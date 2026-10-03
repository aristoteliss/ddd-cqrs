/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@cqrs-ddd/pipeline';
import {
  MetricsBehavior,
  type MetricsBehaviorOptions,
} from '../metrics.behavior.js';

export type MetricsIntentOptions = MetricsBehaviorOptions;

/**
 * Returns a metrics behavior entry for `pipeline.wrap()` or `createPipeline({ globalBehaviors })`.
 * @param options Per-handler metrics options; omitted fields use behavior defaults.
 * @returns The behavior class and options tuple.
 * @example
 * ```ts
 * @pipeline.wrap({ kind: 'query' }, metrics({ meterName: 'users-api.auth' }))
 * ```
 */
export function metrics(
  options: MetricsIntentOptions = {},
): PipelineBehaviorTuple<MetricsBehavior, MetricsBehaviorOptions> {
  return [MetricsBehavior, options];
}
