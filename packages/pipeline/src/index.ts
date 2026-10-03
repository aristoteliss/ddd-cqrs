/* Copyright (C) 2026-present Aristotelis — see repository license. */

export * from './behaviors/logging.behavior.js';
export {
  pipelineStore,
  SET_REQUEST,
  SET_TENANT_ID,
} from './constants/pipeline-context.constants.js';
export {
  createPipeline,
  type DeclaredKind,
  type Pipeline,
  type PipelineOptions,
  REQUEST_KIND,
  type Wrap,
  type WrapOptions,
} from './create-pipeline.js';
export type {
  PipelineBehaviorEntry,
  PipelineBehaviorTuple,
} from './entries.js';
export { MissingPartitionError } from './errors/missing-partition.error.js';
export * from './errors/missing-pipeline-item.error.js';
export {
  type BehaviorEntryAccumulators,
  behaviorEntryType,
  normalizeBehaviorEntries,
} from './helpers/behavior-entries.js';
export {
  type BehaviorId,
  getBehaviorId,
  PIPELINE_BEHAVIOR_ID,
} from './helpers/behavior-id.js';
export {
  type LoggingIntentOptions,
  logging,
} from './helpers/logging.intent.js';
export { toPostgresJson } from './helpers/postgres-json.js';
export { replaceRequest } from './helpers/replace-request.js';
export {
  type TenantPartitionOptions,
  tenantSegments,
} from './helpers/tenant-partition.js';
export type {
  ContextSource,
  ContextSources,
  CorrelationSource,
} from './interfaces/context-source.interface.js';
export * from './interfaces/pipeline.behavior.interface.js';
export * from './interfaces/pipeline.context.interface.js';
export * from './interfaces/pipeline-behavior-contract.interface.js';
export * from './interfaces/pipeline-handler-meta.interface.js';
export {
  type LogLevel,
  type PinoLike,
  type PipelineLogger,
  pinoLogger,
} from './logger.js';
export type {
  GlobalBehaviorScope,
  GlobalBehaviorsOptions,
} from './options/global-behaviors.options.js';
export * from './pipeline.context.js';
export * from './pipeline-items.js';
export { validateBehaviorContracts } from './services/pipeline-contracts.js';
export {
  compilePipelinePlan,
  type PipelineDeclaration,
  type RequestKind,
  toGlobalConfigs,
} from './services/pipeline-plan.js';
export {
  createPipelineRunner,
  type PipelineRunner,
} from './services/pipeline-runner.js';
export type { Constructor } from './types.js';
