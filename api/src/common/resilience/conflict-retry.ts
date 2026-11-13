/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ConcurrencyConflictError } from '@cqrs-ddd/core/domain';
import { resilience } from '@cqrs-ddd/pipeline-resilience';

/**
 * The `@UsePipeline` entry that runs a handler again, at most two more times and
 * with no delay, when a concurrent write wins the version check of its save.
 *
 * Use it only on a handler that reads its aggregate again from primary storage
 * on each run and whose failed save wrote nothing that a second run repeats.
 *
 * @example
 * ```ts
 * @CommandHandler(RevokeAuthCommand)
 * @UsePipeline(audit({ action }), retryOnConflict())
 * export class RevokeAuthHandler extends CommandBaseHandler<RevokeAuthCommand, Auth> {}
 * ```
 */
export function retryOnConflict() {
  return resilience({
    handle: (error) => error instanceof ConcurrencyConflictError,
    retry: { maxAttempts: 2, replaySafe: true },
  });
}
