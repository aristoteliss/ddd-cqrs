/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@cqrs-ddd/pipeline';
import type { RateLimiterLike } from './rate-limiter.interface.js';

/**
 * Derives the rate-limit bucket key from the pipeline context — e.g. combine
 * `context.requestName` with a tenant or user id to limit per caller.
 */
export type RateLimitKeyFactory = (context: IPipelineContext) => string;

/**
 * Computes the points a request costs from the pipeline context — e.g. one
 * point per item of a bulk command. Must return a non-negative safe integer.
 */
export type RateLimitCostFactory = (context: IPipelineContext) => number;

/**
 * Per-handler (and constructor-default) options for {@link RateLimitBehavior}.
 *
 * @example Tenant + caller scoped limit
 * ```ts
 * const perUser = createPartitionedRateLimitKeyFactory(
 *   (ctx) => ctx.items.get('userId') as string | undefined,
 * );
 *
 * class CreateOrderHandler {
 *   @pipeline.wrap({ kind: 'command' }, [RateLimitBehavior, {
 *     keyFactory: perUser,
 *     points: 1,
 *   }])
 *   async handle(command: CreateOrderCommand) {}
 * }
 * ```
 */
export interface RateLimitBehaviorOptions {
  /**
   * Points this request costs: a non-negative safe integer, or a
   * {@link RateLimitCostFactory} computing it per request. `0` charges
   * nothing: the limiter is not called and no key is built. Default `1`.
   *
   * @example One point per imported row
   * ```ts
   * points: (ctx) => (ctx.request as ImportUsersCommand).rows.length
   * ```
   */
  points?: number | RateLimitCostFactory;
  /**
   * Builds the bucket key. Required whenever the behavior executes; there is
   * no implicit shared bucket. Prefer `createPartitionedRateLimitKeyFactory`
   * for tenant/caller-aware limits.
   */
  keyFactory?: RateLimitKeyFactory;
  /** Optional prefix prepended to the key as `"<prefix>:<key>"`. */
  keyPrefix?: string;
  /**
   * Per-handler limiter override — use a stricter/looser limiter for specific
   * handlers without changing the global one. Defaults to the injected limiter.
   */
  limiter?: RateLimiterLike;
  /**
   * When the backing store itself errors (e.g. Redis is unreachable — distinct
   * from a normal limit hit), allow the request through (`true`, default) or
   * reject it (`false`). Fail-open favors availability; fail-closed favors
   * strict protection.
   */
  failOpen?: boolean;
}
