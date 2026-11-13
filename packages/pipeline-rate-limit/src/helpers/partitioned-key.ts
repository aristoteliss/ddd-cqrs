/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type IPipelineContext,
  principalSegments,
  type TenantPartitionOptions,
  tenantSegments,
} from '@cqrs-ddd/pipeline';
import { joinKeySegments } from '@cqrs-ddd/safe-stringify';
import { MissingRateLimitPartitionError } from '../errors/missing-partition.error.js';
import type { RateLimitKeyFactory } from '../interfaces/rate-limit-options.interface.js';

/**
 * Resolves the stable caller/partition identifier used by
 * {@link createPartitionedRateLimitKeyFactory}.
 *
 * Typical values are an authenticated user ID, account ID, API-client ID, or a
 * trusted transport identity copied into `context.items` by an earlier behavior.
 *
 * @typeParam TRequest - The request class the handler receives, which types
 *   `context.request`. The factory does not check it at run time.
 */
export type RateLimitPartitionFactory<TRequest = unknown> = (
  context: IPipelineContext<TRequest>,
) => string | undefined;

/** Options for {@link createPartitionedRateLimitKeyFactory}. */
export interface PartitionedRateLimitKeyOptions extends TenantPartitionOptions {
  /**
   * Behavior when the partition factory cannot resolve a non-empty identity.
   *
   * - `throw` — fail before consuming the limiter (recommended for per-caller
   *   security limits because silently falling back could merge callers).
   * - `request` — fall back to a bucket shared by every caller of this request
   *   within the same tenant partition.
   *
   * @default 'throw'
   */
  onMissingPartition?: 'throw' | 'request';
}

/**
 * Creates a {@link RateLimitKeyFactory} for per-caller limits.
 *
 * Segments are escaped and joined through the core key helper so tenant,
 * caller/account identity, and request name remain distinct even when values
 * contain separator characters.
 *
 * @param partitionFactory - Resolves the stable caller/account identity.
 * @param options - Tenant and missing-partition policy.
 * @returns A `RateLimitKeyFactory` suitable for `RateLimitBehaviorOptions.keyFactory`.
 * @throws {MissingRateLimitPartitionError} When a required tenant or caller partition is absent.
 *
 * The produced key is `<tenantId>:<partition>:<requestName>` when tenant
 * inclusion is enabled, `<partition>:<requestName>` otherwise.
 * `RateLimitBehaviorOptions.keyPrefix` is still applied afterwards by
 * `buildRateLimitKey()`, so environment/service prefixes remain orthogonal.
 *
 * @example Per authenticated user, tenant-aware and fail-closed by default
 * ```ts
 * const perUserKey = createPartitionedRateLimitKeyFactory((ctx) =>
 *   ctx.items.get('currentUserId') as string | undefined,
 * );
 *
 * class CreateOrderHandler {
 *   @pipeline.wrap({ kind: 'command' }, [RateLimitBehavior, { keyFactory: perUserKey, keyPrefix: 'write-api' }])
 *   async handle(command: CreateOrderCommand) {}
 * }
 * ```
 *
 * @example Per value of the request, typed by the request class
 * ```ts
 * createPartitionedRateLimitKeyFactory<LoginCommand>((ctx) => ctx.request.clientIp);
 * ```
 *
 * @example Single-tenant deployment — say so explicitly
 * ```ts
 * createPartitionedRateLimitKeyFactory(readUserId, { includeTenant: false });
 * ```
 *
 * @example Account-wide bucket shared by every user in the account
 * ```ts
 * createPartitionedRateLimitKeyFactory(readAccountId, { includeTenant: true });
 * ```
 */
export function createPartitionedRateLimitKeyFactory<TRequest = unknown>(
  partitionFactory: RateLimitPartitionFactory<TRequest>,
  options: PartitionedRateLimitKeyOptions = {},
): RateLimitKeyFactory {
  const onMissingPartition = options.onMissingPartition ?? 'throw';

  const keyFor: RateLimitKeyFactory = (context) => {
    const tenant = tenantSegments(
      context,
      options,
      MissingRateLimitPartitionError,
    );

    const resolved = partitionFactory(context as IPipelineContext<TRequest>);
    const partition = principalSegments(
      typeof resolved === 'string' ? resolved : undefined,
    );

    if (!partition) {
      if (onMissingPartition === 'throw') {
        throw new MissingRateLimitPartitionError(
          context.requestName,
          'caller',
          "Return a stable caller/account identifier, or configure onMissingPartition: 'request'.",
        );
      }
      // Shared bucket, but still inside the tenant partition when one is used,
      // so an anonymous caller in one tenant cannot exhaust another tenant's quota.
      return joinKeySegments([...tenant, context.requestName]);
    }

    return joinKeySegments([...tenant, ...partition, context.requestName]);
  };

  return keyFor;
}
