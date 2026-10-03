/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorEntry } from '../entries.js';
import {
  type BehaviorEntryAccumulators,
  normalizeBehaviorEntries,
} from '../helpers/behavior-entries.js';
import { type BehaviorId, getBehaviorId } from '../helpers/behavior-id.js';
import type { IPipelineBehavior } from '../interfaces/pipeline.behavior.interface.js';
import type { GlobalBehaviorsOptions } from '../options/global-behaviors.options.js';
import type { Constructor } from '../types.js';

/** The request kinds a pipeline distinguishes; `unknown` matches only `scope: 'all'`. */
export type RequestKind = 'command' | 'query' | 'event' | 'unknown';

/** What a handler, or a wrapped function, declares for its pipeline. */
export interface PipelineDeclaration {
  /** Name used in configuration error messages. */
  handlerName: string;
  requestKind: RequestKind;
  /** Behaviors declared on the handler, deduplicated, in order. */
  handlerBehaviorTypes?: Constructor<IPipelineBehavior>[];
  /** Options of the handler's tuple entries. */
  handlerOptions?: Map<BehaviorId, Record<string, unknown>>;
  /** Global behaviors the handler opts out of. */
  skippedBehaviorTypes?: Constructor<IPipelineBehavior>[];
  globalBehaviors?: GlobalBehaviorsOptions | GlobalBehaviorsOptions[];
}

/**
 * Compiles a pipeline declaration into its effective, ordered behaviors and merged
 * options, without resolving instances. Global `before` behaviors come first, then
 * the handler's own, then global `after` ones; a handler entry for a global behavior
 * supplies options at the global position.
 *
 * @throws Error when one behavior is both skipped and declared.
 * @example
 * ```ts
 * const plan = compilePipelinePlan({
 *   handlerName: 'getPrice',
 *   requestKind: 'query',
 *   handlerBehaviorTypes: [CacheBehavior],
 *   globalBehaviors: { before: [LoggingBehavior] },
 * });
 * plan.behaviorTypes; // [LoggingBehavior, CacheBehavior]
 * ```
 */
export function compilePipelinePlan(declaration: PipelineDeclaration) {
  const {
    handlerName,
    requestKind,
    handlerBehaviorTypes,
    handlerOptions,
    skippedBehaviorTypes,
    globalBehaviors,
  } = declaration;

  if (skippedBehaviorTypes && skippedBehaviorTypes.length > 0) {
    const handlerBehaviorIds = new Set<BehaviorId>(
      (handlerBehaviorTypes ?? []).map(getBehaviorId),
    );
    for (const skippedType of skippedBehaviorTypes) {
      const id = getBehaviorId(skippedType);
      if (handlerBehaviorIds.has(id) || handlerOptions?.has(id)) {
        throw new Error(
          `Handler ${handlerName} has contradictory pipeline configuration: ` +
            `behavior ${skippedType.name} is both skipped and declared. ` +
            `Remove either the skip or the declaration.`,
        );
      }
    }
  }

  const { beforeTypes, afterTypes, globalOptions } = resolveGlobalBehaviors(
    globalBehaviors,
    requestKind,
  );

  const skippedBehaviorIds = new Set<BehaviorId>(
    (skippedBehaviorTypes ?? []).map(getBehaviorId),
  );

  const effectiveBeforeTypes = beforeTypes.filter(
    (type) => !skippedBehaviorIds.has(getBehaviorId(type)),
  );
  const effectiveAfterTypes = afterTypes.filter(
    (type) => !skippedBehaviorIds.has(getBehaviorId(type)),
  );

  // Handler declarations override options for a global behavior of the same
  // class, but must not relocate it. A global security guard configured in
  // `before` must remain outside handler-level cache/idempotency behaviors
  // that can short-circuit without calling next().
  const globalBehaviorIds = new Set<BehaviorId>(
    [...effectiveBeforeTypes, ...effectiveAfterTypes].map(getBehaviorId),
  );
  const handlerOnlyTypes = (handlerBehaviorTypes ?? []).filter(
    (type) => !globalBehaviorIds.has(getBehaviorId(type)),
  );

  // Effective order: globalBefore → non-global handler behaviors → globalAfter.
  // Matching handler entries supply options at their original global position.
  const behaviorTypes: Constructor<IPipelineBehavior>[] = [
    ...effectiveBeforeTypes,
    ...handlerOnlyTypes,
    ...effectiveAfterTypes,
  ];

  // Handler options shallowly override global options; nested values are replaced.
  const mergedOptions = new Map<BehaviorId, Record<string, unknown>>(
    globalOptions,
  );
  for (const [id, options] of handlerOptions ?? []) {
    const inherited = mergedOptions.get(id);
    mergedOptions.set(id, inherited ? { ...inherited, ...options } : options);
  }
  for (const skippedId of skippedBehaviorIds) {
    mergedOptions.delete(skippedId);
  }

  return {
    behaviorTypes,
    mergedOptions,
    hasPipeline: behaviorTypes.length > 0,
    handlerOptions,
    globalOptions,
    handlerBehaviorTypes,
    globalBehaviorIds,
  };
}

/** Normalizes the single-object and array forms of `globalBehaviors`. */
export function toGlobalConfigs(
  globalBehaviors:
    | GlobalBehaviorsOptions
    | GlobalBehaviorsOptions[]
    | undefined,
): GlobalBehaviorsOptions[] {
  if (!globalBehaviors) return [];
  return Array.isArray(globalBehaviors) ? globalBehaviors : [globalBehaviors];
}

/**
 * Resolves global before/after behaviors that match the given handler kind.
 * `globalBehaviors` may be a single `GlobalBehaviorsOptions` object or an array.
 * Each entry is filtered by its `scope` ('all' | 'commands' | 'queries' | 'events').
 * Matching entries are merged — behaviors accumulate across all matching configs.
 *
 * @returns Behavior types to prepend/append plus any inline options from tuple entries.
 */
function resolveGlobalBehaviors(
  globalBehaviors:
    | GlobalBehaviorsOptions
    | GlobalBehaviorsOptions[]
    | undefined,
  requestKind: RequestKind,
): {
  beforeTypes: Constructor<IPipelineBehavior>[];
  afterTypes: Constructor<IPipelineBehavior>[];
  globalOptions: Map<BehaviorId, Record<string, unknown>>;
} {
  const configs = toGlobalConfigs(globalBehaviors);

  const beforeTypes: Constructor<IPipelineBehavior>[] = [];
  const afterTypes: Constructor<IPipelineBehavior>[] = [];

  // One accumulator pair across every matching config and both chain positions,
  // so the first occurrence fixes placement while a later tuple can still
  // supply options without the behavior running more than once.
  const accumulators: BehaviorEntryAccumulators = {
    seen: new Set<BehaviorId>(),
    options: new Map<BehaviorId, Record<string, unknown>>(),
  };

  const parseEntries = (entries: PipelineBehaviorEntry[]) =>
    normalizeBehaviorEntries(
      entries,
      `globalBehaviors for ${requestKind}`,
      true,
      accumulators,
    ).types;

  for (const config of configs) {
    const scope = config.scope ?? 'all';

    // Scope filtering — skip entries that don't match the handler kind
    if (scope === 'commands' && requestKind !== 'command') continue;
    if (scope === 'queries' && requestKind !== 'query') continue;
    if (scope === 'events' && requestKind !== 'event') continue;

    beforeTypes.push(...parseEntries(config.before ?? []));
    afterTypes.push(...parseEntries(config.after ?? []));
  }

  return { beforeTypes, afterTypes, globalOptions: accumulators.options };
}
