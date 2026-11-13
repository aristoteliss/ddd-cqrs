/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { UnauthorizedActionException } from '@cqrs-ddd/pipeline-casl';

/**
 * What a write command answers: the saved aggregate, whose events
 * `CommandBaseHandler` publishes, and its read model as far as the caller may
 * read it, `null` when the caller may not read it at all.
 */
export interface WriteResult<TAggregate, TRead> {
  readonly aggregate: TAggregate;
  readonly read: TRead | null;
}

/**
 * The read model that `project` returns, or `null` when the caller may not read
 * the subject. Every other error of `project` is thrown.
 *
 * @param project - Projects the read model, such as a call of `authorizer.project`.
 *
 * @example
 * ```ts
 * await this.commandRepository.save(user);
 * return { aggregate: user, read: readable(() => projectUserRead(this.authorizer, user)) };
 * ```
 */
export function readable<TRead>(project: () => TRead): TRead | null {
  try {
    return project();
  } catch (error) {
    if (error instanceof UnauthorizedActionException) return null;
    throw error;
  }
}
