/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { BehaviorId } from '../helpers/behavior-id.js';
import type { Constructor } from '../types.js';

/**
 * Pre-computed handler metadata, resolved once, before the first execution.
 * Avoids per-request reflection and string operations.
 */
export interface PipelineHandlerMeta {
  readonly handlerType: Constructor;
  readonly handlerName: string;
  readonly requestKind: 'command' | 'query' | 'event' | 'unknown';
  readonly behaviorOptions?: Map<BehaviorId, Record<string, unknown>>;
  /** The operation name; absent, the request's class name. */
  readonly requestName?: string;
}
