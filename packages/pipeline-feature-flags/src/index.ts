/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * OpenFeature gates for wrapped functions and methods: the behavior, the client factory and `featureFlag()`. The HTTP mapping of its errors is the `@cqrs-ddd/pipeline-feature-flags/http` entry point.
 *
 * @module main
 */

export { FeatureDisabledError } from './errors/feature-disabled.error.js';
export { FeatureFlagEvaluationError } from './errors/feature-flag-evaluation.error.js';
export {
  FEATURE_FLAG_DECISION_ITEM,
  FEATURE_FLAG_DECISION_ITEM_TOKEN,
  FEATURE_FLAG_ITEM,
  FEATURE_FLAG_ITEM_TOKEN,
  FEATURE_FLAG_KEY_ITEM,
  FEATURE_FLAG_KEY_ITEM_TOKEN,
  FeatureFlagBehavior,
} from './feature-flag.behavior.js';
export { buildFeatureFlagAttributes } from './helpers/build-attributes.js';
export {
  baseEvaluationContext,
  buildEvaluationContext,
} from './helpers/evaluation-context.js';
export {
  type FeatureFlagIntentOptions,
  featureFlag,
} from './helpers/feature-flag.intent.js';
export {
  createFeatureFlagClient,
  releaseFeatureFlagProvider,
} from './helpers/feature-flag-client.js';
export type {
  EvaluationContextFactory,
  FeatureFallbackFactory,
  FeatureFlagBehaviorOptions,
  FeatureFlagClientOptions,
  FeatureFlagDecision,
  FeatureFlagErrorPolicy,
  TargetingKeyFactory,
} from './interfaces/feature-flags-options.interface.js';
