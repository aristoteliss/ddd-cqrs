/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Rate limits for wrapped functions and methods: the behavior, key factories and `rateLimit()`. The HTTP mapping of its errors is the `@cqrs-ddd/pipeline-rate-limit/http` entry point.
 *
 * @module main
 */

export {
  MissingRateLimitPartitionError,
  type RateLimitPartitionDimension,
} from './errors/missing-partition.error.js';
export { RateLimitExceededError } from './errors/rate-limit-exceeded.error.js';
export { buildRateLimitAttributes } from './helpers/build-attributes.js';
export { buildRateLimitKey } from './helpers/build-key.js';
export {
  createPartitionedRateLimitKeyFactory,
  type PartitionedRateLimitKeyOptions,
  type RateLimitPartitionFactory,
} from './helpers/partitioned-key.js';
export {
  type RateLimitIntentOptions,
  rateLimit,
} from './helpers/rate-limit.intent.js';
export type {
  RateLimitBehaviorOptions,
  RateLimitCostFactory,
  RateLimitKeyFactory,
} from './interfaces/rate-limit-options.interface.js';
export type {
  RateLimiterLike,
  RateLimiterResLike,
} from './interfaces/rate-limiter.interface.js';
export {
  RATE_LIMIT_ITEM,
  RATE_LIMIT_ITEM_TOKEN,
  RATE_LIMIT_KEY_ITEM,
  RATE_LIMIT_KEY_ITEM_TOKEN,
  RateLimitBehavior,
} from './rate-limit.behavior.js';
