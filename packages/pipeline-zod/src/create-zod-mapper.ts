/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ZodType } from 'zod';
import { ZodValidationError } from './errors/zod-validation.error.js';

/** A schema-backed mapper returned by {@link createZodMapper}. */
export interface ZodMapper<TInput, TOutput> {
  /** The schema the mapper parses with, for reuse (e.g. `.extend(...)`). */
  readonly schema: ZodType<TOutput, TInput>;
  /**
   * Parses `input` and returns the schema output, including any `.transform()`.
   *
   * @throws ZodValidationError when parsing fails.
   */
  map(input: TInput): TOutput;
}

/**
 * Creates a mapper that parses input through a Zod schema, typically turning a
 * validated request body into a command at the HTTP edge.
 *
 * It parses synchronously, so the schema must not use async refinements or transforms. A
 * failure throws `ZodValidationError`, whose `details` hold `{ formErrors, fieldErrors }`;
 * `toHttpResponse` of `@cqrs-ddd/pipeline-zod/http` answers it with HTTP 400.
 *
 * @param schema - Schema whose output is the mapped value.
 * @returns A {@link ZodMapper} over `schema`.
 * @example Map a request body to a command
 * ```ts
 * export const CreateUserMapper = createZodMapper(
 *   CreateUserDtoSchema.transform(
 *     ({ name, email }) => new CreateUserCommand({ username: name, email }),
 *   ),
 * );
 *
 * app.post('/users', async (req, res) => {
 *   res.json(await commandBus.execute(CreateUserMapper.map(req.body)));
 * });
 * ```
 */
export function createZodMapper<TInput, TOutput>(
  schema: ZodType<TOutput, TInput>,
): ZodMapper<TInput, TOutput> {
  return {
    schema,
    map(input: TInput): TOutput {
      const result = schema.safeParse(input);
      if (!result.success) throw new ZodValidationError(result.error);
      return result.data as TOutput;
    },
  };
}
