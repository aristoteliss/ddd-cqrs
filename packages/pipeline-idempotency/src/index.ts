/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Idempotent commands: the behavior, its stores, key factories and `idempotent()`. The HTTP mapping of its errors is the `@cqrs-ddd/pipeline-idempotency/http` entry point.
 *
 * @module main
 */

export { DEFAULT_IDEMPOTENCY_TTL_MS } from './constants/tokens.js';
export {
  IdempotencyCompletionError,
  type IdempotencyFinalizationPhase,
} from './errors/idempotency-completion.error.js';
export {
  IdempotencyConflictError,
  type IdempotencyConflictReason,
} from './errors/idempotency-conflict.error.js';
export {
  type IdempotencyPartitionDimension,
  MissingIdempotencyPartitionError,
} from './errors/missing-partition.error.js';
export { buildIdempotencyAttributes } from './helpers/build-attributes.js';
export { fingerprintValue } from './helpers/fingerprint.js';
export {
  type IdempotencyIntentOptions,
  idempotent,
} from './helpers/idempotency.intent.js';
export {
  createPartitionedIdempotencyKeyFactory,
  type IdempotencyOperationFactory,
  type IdempotencyPrincipalFactory,
  type PartitionedIdempotencyKeyOptions,
} from './helpers/partitioned-key.js';
export {
  IDEMPOTENCY_KEY_ITEM,
  IDEMPOTENCY_KEY_ITEM_TOKEN,
  IDEMPOTENCY_OWNERSHIP_LOST_ITEM,
  IDEMPOTENCY_OWNERSHIP_LOST_ITEM_TOKEN,
  IDEMPOTENCY_REPLAYED_ITEM,
  IDEMPOTENCY_REPLAYED_ITEM_TOKEN,
  IdempotencyBehavior,
} from './idempotency.behavior.js';
export type {
  IdempotencyBehaviorOptions,
  IdempotencyKeyFactory,
  IdempotencyReplayScopeFactory,
} from './interfaces/idempotency-options.interface.js';
export type {
  IdempotencyRecord,
  IdempotencyRequestKind,
  IdempotencyStatus,
  JsonValue,
} from './interfaces/idempotency-record.interface.js';
export type {
  IdempotencyStore,
  MaybePromise,
} from './interfaces/idempotency-store.interface.js';
export {
  MemoryIdempotencyStore,
  type MemoryIdempotencyStoreOptions,
} from './stores/memory.store.js';
export {
  createIdempotencyTableSql,
  PostgresIdempotencyStore,
  type PostgresIdempotencyStoreOptions,
  type PostgresQueryableLike,
  type PostgresQueryResultLike,
  type PostgresRowLike,
} from './stores/postgres.store.js';
export {
  type RedisClientLike,
  RedisIdempotencyStore,
  type RedisIdempotencyStoreOptions,
} from './stores/redis.store.js';
