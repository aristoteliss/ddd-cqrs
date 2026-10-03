/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@cqrs-ddd/pipeline';
import type { RateLimitBehaviorOptions } from '../interfaces/rate-limit-options.interface.js';
import { RateLimitBehavior } from '../rate-limit.behavior.js';

export type RateLimitIntentOptions = Omit<
  RateLimitBehaviorOptions,
  'keyFactory'
> &
  (
    | {
        keyFactory: NonNullable<RateLimitBehaviorOptions['keyFactory']>;
        inheritModuleKey?: never;
      }
    | { inheritModuleKey: true; keyFactory?: never }
  );

/**
 * Returns a rate-limit behavior entry for `pipeline.wrap()` or `createPipeline({ globalBehaviors })`.
 * @param options A key factory and rate-limit options, or `inheritModuleKey: true`
 * when the behavior's constructor defaults supply the key factory. The inheritance marker is not
 * forwarded to the behavior and does not validate module configuration.
 * @returns The behavior class and options tuple.
 * Use `createPartitionedRateLimitKeyFactory` for tenant/caller-specific limits.
 * @example
 * ```ts
 * export const placeOrder = pipeline.wrap(
 *   { name: 'placeOrder', kind: 'command' },
 *   rateLimit({ keyFactory: perUserKey, points: 1 }),
 * )(orders.place);
 *
 * // The key factory comes from the RateLimitBehavior constructor defaults.
 * const entry = rateLimit({ inheritModuleKey: true, points: 2 });
 * ```
 */
export function rateLimit(
  options: RateLimitIntentOptions,
): PipelineBehaviorTuple<RateLimitBehavior, RateLimitBehaviorOptions> {
  const { inheritModuleKey: _inheritModuleKey, ...behaviorOptions } = options;
  return [RateLimitBehavior, behaviorOptions];
}
