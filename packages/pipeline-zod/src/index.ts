/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Zod validation: `validated()`, the behavior, request classes that carry their schema, and `createZodMapper()` for the HTTP edge. The HTTP mapping of its errors is the `@cqrs-ddd/pipeline-zod/http` entry point.
 *
 * @module main
 */

export { createZodMapper, type ZodMapper } from './create-zod-mapper.js';
export {
  type AbstractConstructor,
  createCommand,
  createQuery,
  createZodRequest,
  type InferInput,
  type InferOutput,
  type ZodCommandClass,
  type ZodQueryClass,
  type ZodRequestClass,
} from './create-zod-request.js';
export { ZodValidationError } from './errors/zod-validation.error.js';
export { validated } from './helpers/validated.intent.js';
export { updatable, updatableFieldsOf } from './updatable.js';
export {
  getRawInput,
  getValidatedData,
  ZOD_RAW_INPUT_KEY,
  ZOD_SCHEMA_KEY,
  ZOD_VALIDATED_DATA_KEY,
  ZodValidationBehavior,
  type ZodValidationOptions,
} from './zod-validation.behavior.js';
