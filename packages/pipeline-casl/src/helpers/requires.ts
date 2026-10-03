/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@cqrs-ddd/pipeline';
import { CaslBehavior, type CaslBehaviorOptions } from '../casl.behavior.js';
import type { AbilityRequirement } from '../types/casl.types.js';

/**
 * `[CaslBehavior, { rules }]` for `pipeline.wrap()`; every requirement must pass.
 *
 * @example
 * ```ts
 * class Users {
 *   @pipeline.wrap({ kind: 'query' }, requires({ action: 'read', subject: 'User' }))
 *   async find(query: GetUserQuery) {}
 * }
 *
 * class Posts {
 *   @pipeline.wrap(
 *     { kind: 'command' },
 *     requires(
 *       { action: 'update', subject: 'Post', field: 'title' },
 *       { action: 'update', subject: 'Post', field: 'body' },
 *     ),
 *   )
 *   async edit(command: EditPostCommand) {}
 * }
 * ```
 */
export function requires(
  ...rules: [AbilityRequirement, ...AbilityRequirement[]]
): PipelineBehaviorTuple<CaslBehavior, CaslBehaviorOptions> {
  return [CaslBehavior, { rules }];
}
