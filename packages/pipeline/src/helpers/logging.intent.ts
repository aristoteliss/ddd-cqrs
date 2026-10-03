/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  LoggingBehavior,
  type LoggingBehaviorOptions,
} from '../behaviors/logging.behavior.js';
import type { PipelineBehaviorTuple } from '../entries.js';

export type LoggingIntentOptions = LoggingBehaviorOptions;

/**
 * Returns a logging behavior entry for `pipeline.wrap()` or `createPipeline({ globalBehaviors })`.
 * @param options Per-handler logging options; omitted fields use behavior defaults.
 * @returns The behavior class and options tuple.
 * @example
 * ```ts
 * export const getPrice = pipeline.wrap(
 *   { name: 'getPrice', kind: 'query' },
 *   logging({ requestResponseLogLevel: 'log' }),
 * )(async (sku: string) => prices.find(sku));
 * ```
 */
export function logging(
  options: LoggingIntentOptions = {},
): PipelineBehaviorTuple<LoggingBehavior, LoggingBehaviorOptions> {
  return [LoggingBehavior, options];
}
