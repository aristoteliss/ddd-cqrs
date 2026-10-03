/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@cqrs-ddd/pipeline';
import type { ZodType } from 'zod';
import {
  ZodValidationBehavior,
  type ZodValidationOptions,
} from '../zod-validation.behavior.js';

/**
 * The entry that validates an operation's input against `schema` and hands the handler
 * the parsed copy.
 *
 * @example
 * ```ts
 * export const order = pipeline.wrap(
 *   { name: 'order', kind: 'command' },
 *   validated(z.object({ sku: z.string(), qty: z.coerce.number().int().positive() })),
 * )(async (input) => orders.place(input));
 * ```
 */
export function validated(
  schema: ZodType,
): PipelineBehaviorTuple<ZodValidationBehavior, ZodValidationOptions> {
  return [ZodValidationBehavior, { schema }];
}
