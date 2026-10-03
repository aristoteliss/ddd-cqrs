/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorEntry } from '../entries.js';

/** Determines which handler kinds global behaviors apply to. */
export type GlobalBehaviorScope = 'commands' | 'queries' | 'events' | 'all';

/**
 * Configuration for behaviors that are automatically applied to all
 * Commands, Queries, and/or Events, regardless of the entries declared at a call site.
 *
 * Execution order:
 * `[before] → [call-site behaviors] → [after] → handler`. If the same
 * behavior class is declared globally and at a call site, it runs once at its
 * global position with the call-site options merged over the global ones.
 *
 * @example
 * ```ts
 * // Single object
 * createPipeline({
 *   globalBehaviors: {
 *     scope: 'all',
 *     before: [LoggingBehavior, [MetricsBehavior, { meterName: 'api' }]],
 *     after: [AuditBehavior],
 *   },
 * });
 *
 * // Array — different scopes for different request kinds
 * createPipeline({
 *   globalBehaviors: [
 *     { scope: 'commands', before: [AuditBehavior] },
 *     { scope: 'queries', before: [CacheBehavior] },
 *     { scope: 'all', after: [LoggingBehavior] },
 *   ],
 * });
 * ```
 */
export interface GlobalBehaviorsOptions {
  /**
   * Which handler kinds these behaviors apply to.
   * - `'commands'` — only command handlers
   * - `'queries'`  — only query handlers
   * - `'events'`   — only event handlers
   * - `'all'`      — commands, queries, and events
   *
   * @default 'all'
   */
  scope?: GlobalBehaviorScope;

  /**
   * Behaviors prepended BEFORE the behaviors declared at the call site.
   * These run first (outermost) in the pipeline chain.
   */
  before?: PipelineBehaviorEntry[];

  /**
   * Behaviors appended AFTER the behaviors declared at the call site
   * (still before the actual handler execution).
   * These run closest to the handler, after all other behaviors.
   */
  after?: PipelineBehaviorEntry[];
}
