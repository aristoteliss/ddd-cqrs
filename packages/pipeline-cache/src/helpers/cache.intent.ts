/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@cqrs-ddd/pipeline';
import { CacheBehavior } from '../cache.behavior.js';
import type { CacheBehaviorOptions } from '../interfaces/cache-options.interface.js';

export type CacheIntentOptions = Omit<CacheBehaviorOptions, 'key'> &
  (
    | {
        key: NonNullable<CacheBehaviorOptions['key']>;
        inheritModuleKey?: never;
      }
    | { inheritModuleKey: true; key?: never }
  );

/**
 * Returns a cache behavior entry for `pipeline.wrap()` or `createPipeline({ globalBehaviors })`.
 * @param options A key factory and cache options, or `inheritModuleKey: true`
 * when the behavior's constructor defaults supply the key factory. The inheritance marker is not
 * forwarded to the behavior and does not validate module configuration.
 * @returns The behavior class and options tuple.
 * Keys for authorized responses must separate tenant, principal and permission
 * scope; prefer `createPartitionedCacheKeyFactory` for those responses.
 * @example
 * ```ts
 * export const getUsers = pipeline.wrap(
 *   { name: 'getUsers', kind: 'query' },
 *   cache({ key: userCacheKey, ttl: 30_000 }),
 * )(loadUsers);
 *
 * // The key factory comes from the CacheBehavior constructor defaults.
 * const entry = cache({ inheritModuleKey: true, ttl: 30_000 });
 * ```
 */
export function cache(
  options: CacheIntentOptions,
): PipelineBehaviorTuple<CacheBehavior, CacheBehaviorOptions> {
  const { inheritModuleKey: _inheritModuleKey, ...behaviorOptions } = options;
  return [CacheBehavior, behaviorOptions];
}
