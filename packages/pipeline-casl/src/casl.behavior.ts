/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
  PIPELINE_BEHAVIOR_ID,
} from '@cqrs-ddd/pipeline';
import { CASL_ABILITY_KEY, CASL_PRINCIPAL_KEY } from './constants/tokens.js';
import { UnauthorizedActionException } from './errors/unauthorized-action.exception.js';
import { buildAbility } from './helpers/ability.js';
import type { ICaslPermissionSource } from './interfaces/permission-source.interface.js';
import type { AbilityRequirement } from './types/casl.types.js';

/** Stable behavior identity; cache and idempotency order themselves after it. */
export const CASL_BEHAVIOR_ID = '@cqrs-ddd/pipeline-casl:CaslBehavior';

/** Per-handler options, usually declared with `requires(...)`. */
export interface CaslBehaviorOptions {
  /** Type-level requirements, all of which must pass. */
  rules: readonly [AbilityRequirement, ...AbilityRequirement[]];
}

/**
 * Type-level authorization before the handler runs.
 *
 * Loads the caller through `ICaslPermissionSource`, builds the ability, stores
 * it and the principal in `context.items` for `CaslAuthorizer` and
 * security-scoped keys, and throws `UnauthorizedActionException` unless every
 * requirement passes. An unauthenticated caller (`null` input) is denied.
 * Errors from the source or from malformed rules propagate unchanged.
 * A handler without `rules` runs without loading permissions.
 */
export class CaslBehavior implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_ID] = CASL_BEHAVIOR_ID;

  constructor(private readonly source: ICaslPermissionSource) {
    if (typeof source?.load !== 'function') {
      throw new TypeError(
        'CaslBehavior requires a permission source (ICaslPermissionSource) with a load() method.',
      );
    }
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const rules =
      context.getBehaviorOptions<CaslBehaviorOptions>(CaslBehavior)?.rules;
    if (!rules?.length) return next();

    const input = await this.source.load(context);
    if (!input) {
      throw new UnauthorizedActionException({
        action: rules[0].action,
        subject: rules[0].subject,
        reason: 'Access denied — authentication required.',
      });
    }

    const ability = buildAbility(input.rules, input.principal);
    context.items.set(CASL_PRINCIPAL_KEY, input.principal);
    context.items.set(CASL_ABILITY_KEY, ability);

    for (const { action, subject, field } of rules) {
      const allowed = field
        ? ability.can(action, subject, field)
        : ability.can(action, subject);
      if (!allowed) {
        throw new UnauthorizedActionException({
          action,
          subject,
          ...(field ? { fields: [field] } : {}),
        });
      }
    }
    return next();
  }
}
