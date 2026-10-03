/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@cqrs-ddd/pipeline';
import { IdempotencyBehavior } from '../idempotency.behavior.js';
import type { IdempotencyBehaviorOptions } from '../interfaces/idempotency-options.interface.js';

export type IdempotencyIntentOptions = Omit<
  IdempotencyBehaviorOptions,
  'keyFactory'
> &
  (
    | {
        keyFactory: NonNullable<IdempotencyBehaviorOptions['keyFactory']>;
        inheritModuleKey?: never;
      }
    | { inheritModuleKey: true; keyFactory?: never }
  );

/**
 * Returns an idempotency behavior entry for `pipeline.wrap()` or `createPipeline({ globalBehaviors })`.
 * @param options A key factory and idempotency options, or `inheritModuleKey: true`
 * when the behavior's constructor defaults supply the key factory. The inheritance marker is not
 * forwarded to the behavior and does not validate module configuration.
 * @returns The behavior class and options tuple.
 * Keys must distinguish operations and any tenant/principal scope that changes
 * the authorized response; a shared key can replay another caller's response.
 * @example
 * ```ts
 * export const createUser = pipeline.wrap(
 *   { name: 'createUser', kind: 'command' },
 *   idempotent({ keyFactory: createUserKey, ttl: 86_400_000 }),
 * )(users.create);
 *
 * // The key factory comes from the IdempotencyBehavior constructor defaults.
 * const entry = idempotent({ inheritModuleKey: true });
 * ```
 */
export function idempotent(
  options: IdempotencyIntentOptions,
): PipelineBehaviorTuple<IdempotencyBehavior, IdempotencyBehaviorOptions> {
  const { inheritModuleKey: _inheritModuleKey, ...behaviorOptions } = options;
  return [IdempotencyBehavior, behaviorOptions];
}
