/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineBehavior } from './interfaces/pipeline.behavior.interface.js';
import type { Constructor } from './types.js';

/**
 * A tuple of a pipeline behavior class and its options.
 */
export type PipelineBehaviorTuple<
  TBehavior extends IPipelineBehavior = IPipelineBehavior,
  TOptions extends object = object,
> = [Constructor<TBehavior>, TOptions];

/**
 * A pipeline behavior entry can be either:
 * - A behavior class: `LoggingBehavior`
 * - A tuple of behavior class and options: `[AuditBehavior, { action: 'user.create', severity: 'high' }]`
 */
export type PipelineBehaviorEntry<
  TBehavior extends IPipelineBehavior = IPipelineBehavior,
  TOptions extends object = object,
> = Constructor<TBehavior> | PipelineBehaviorTuple<TBehavior, TOptions>;
