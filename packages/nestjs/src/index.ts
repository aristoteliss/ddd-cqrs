/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * The NestJS adapter: `PipelineModule` runs official `@nestjs/cqrs` handlers through
 * their pipelines, and `ErrorFilter` answers every package error as a NestJS
 * `HttpException`. Correlation and job context are the `@cqrs-ddd/nestjs/correlation`
 * and `@cqrs-ddd/nestjs/job-context` entry points.
 *
 * @module main
 */

export { ErrorFilter } from './filters/error.filter.js';
export {
  type HttpAnswer,
  httpAnswer,
  toHttpException,
  type ValidationDetails,
  validationMessages,
} from './filters/http-exception.js';
export {
  PIPELINE_OPTIONS,
  PipelineBootstrap,
  type PipelineOptions,
} from './pipeline/pipeline.bootstrap.js';
export { PipelineModule } from './pipeline/pipeline.module.js';
