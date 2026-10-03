/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { SET_REQUEST } from '../constants/pipeline-context.constants.js';
import type { IPipelineContext } from '../interfaces/pipeline.context.interface.js';

/**
 * Hands the handler `value` in place of its input, for a behavior that produces a new
 * value instead of changing the caller's object, such as a validated, parsed copy. For a
 * wrapped function that takes several arguments, `value` is the new argument array.
 * Later behaviors see the replacement as `context.request`.
 *
 * @throws TypeError when the context does not support replacement, or when a
 *   multi-argument call receives a value that is not an array.
 * @example
 * ```ts
 * async handle(context: IPipelineContext, next: NextDelegate) {
 *   replaceRequest(context, schema.parse(context.request));
 *   return next();
 * }
 * ```
 */
export function replaceRequest(
  context: IPipelineContext,
  value: unknown,
): void {
  const setter = (
    context as Partial<Record<typeof SET_REQUEST, (v: unknown) => void>>
  )[SET_REQUEST];
  if (typeof setter !== 'function') {
    throw new TypeError(
      `replaceRequest: the context of ${context.requestName} cannot replace its request.`,
    );
  }
  if (Array.isArray(context.request) && !Array.isArray(value)) {
    throw new TypeError(
      `replaceRequest: ${context.requestName} takes several arguments; pass the new argument array.`,
    );
  }
  setter.call(context, value);
}
