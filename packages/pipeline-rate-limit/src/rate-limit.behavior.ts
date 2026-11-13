/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  behaviorDiagnostic,
  createPipelineItem,
  type IPipelineBehavior,
  type IPipelineBehaviorContract,
  type IPipelineBehaviorOptionsResolver,
  type IPipelineContext,
  type NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
  type PipelineItemToken,
  type PipelineLogger,
  setPipelineItem,
} from '@cqrs-ddd/pipeline';
import { RateLimitExceededError } from './errors/rate-limit-exceeded.error.js';
import { buildRateLimitKey } from './helpers/build-key.js';
import type { RateLimitBehaviorOptions } from './interfaces/rate-limit-options.interface.js';
import type {
  RateLimiterLike,
  RateLimiterResLike,
} from './interfaces/rate-limiter.interface.js';

/**
 * The `context.items` entry containing the result of a rate-limit check (or rejection payload).
 *
 * Read it with `getPipelineItem` or `requirePipelineItem`.
 */
export const RATE_LIMIT_ITEM_TOKEN: PipelineItemToken<RateLimiterResLike> =
  createPipelineItem<RateLimiterResLike>('RATE_LIMIT_ITEM');

/**
 * The `context.items` entry containing the resolved rate limit bucket key string.
 *
 * Read it with `getPipelineItem` or `requirePipelineItem`.
 */
export const RATE_LIMIT_KEY_ITEM_TOKEN: PipelineItemToken<string> =
  createPipelineItem<string>('RATE_LIMIT_KEY_ITEM');

/** One request's rate-limit check: its context, its effective options and its bucket key. */
interface RateLimitCheck {
  readonly context: IPipelineContext;
  readonly options: RateLimitBehaviorOptions;
  readonly key: string;
}

/** Whether a rejection value is a `rate-limiter-flexible` result (a limit hit). */
function isRateLimiterRes(value: unknown): value is RateLimiterResLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RateLimiterResLike).msBeforeNext === 'number' &&
    typeof (value as RateLimiterResLike).remainingPoints === 'number'
  );
}

/**
 * Pipeline behavior that enforces rate limits before a handler runs.
 *
 * For each request it consumes `points` (default `1`, or computed per request
 * when `points` is a function) from a bucket keyed by
 * {@link buildRateLimitKey}. A cost of `0` charges nothing and skips the
 * limiter. If the bucket is exhausted it throws
 * {@link RateLimitExceededError} (map to HTTP 429 with
 * `toHttpResponse` of `@cqrs-ddd/pipeline-rate-limit/http`); otherwise the handler proceeds.
 *
 * `context.request` is the CQRS command/query/event, not an Express/Fastify
 * request. Transport metadata needed for keying should be copied into the CQRS
 * request or written to `context.items` by an earlier behavior.
 *
 * Backend-agnostic: it depends only on {@link RateLimiterLike}, so any
 * `rate-limiter-flexible` backend (memory, Redis/Valkey, Mongo, SQL) is a
 * one-line swap in the constructor.
 *
 * @example Per-handler limit, partitioned by tenant and authenticated caller
 * ```ts
 * const perUser = createPartitionedRateLimitKeyFactory(
 *   (ctx) => ctx.items.get('userId') as string | undefined,
 * );
 *
 * class CreateUserHandler {
 *   @pipeline.wrap({ kind: 'command' }, [RateLimitBehavior, { points: 1, keyFactory: perUser }])
 *   async handle(command: CreateUserCommand) {}
 * }
 * ```
 */
export class RateLimitBehavior
  implements
    IPipelineBehavior,
    IPipelineBehaviorOptionsResolver<RateLimitBehaviorOptions>
{
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    validate: (context) => {
      const options = context.effectiveOptions as
        | RateLimitBehaviorOptions
        | undefined;

      if (!options?.keyFactory) {
        return behaviorDiagnostic(context, RateLimitBehavior.name, {
          message: 'Active RateLimitBehavior requires an explicit `keyFactory`',
          fix:
            'Provide keyFactory in the [RateLimitBehavior, { keyFactory: ... }] entry, ' +
            'the constructor defaults, or use createPartitionedRateLimitKeyFactory(...).',
        });
      }
      if (typeof options.keyFactory !== 'function') {
        return behaviorDiagnostic(context, RateLimitBehavior.name, {
          message: `RateLimitBehavior keyFactory must be a callable function, received ${typeof options.keyFactory}`,
          fix: 'Pass a valid function (ctx) => string to the keyFactory option of the [RateLimitBehavior, { keyFactory: ... }] entry.',
        });
      }

      const { points } = options;
      const isInvalidPoints =
        points !== undefined &&
        typeof points !== 'function' &&
        !isValidPoints(points);
      if (isInvalidPoints) {
        return behaviorDiagnostic(context, RateLimitBehavior.name, {
          message: `RateLimitBehavior points must be a non-negative safe integer or a function, received ${String(points)}`,
          fix: 'Pass an integer from 0 up (0 charges nothing) or a function (ctx) => number as the points option.',
        });
      }
      return undefined;
    },
  };

  private readonly logger: PipelineLogger;
  private readonly defaults: RateLimitBehaviorOptions;

  constructor(
    private readonly limiter: RateLimiterLike,
    defaults?: RateLimitBehaviorOptions,
    logger?: PipelineLogger,
  ) {
    if (typeof limiter?.consume !== 'function') {
      throw new TypeError(
        'RateLimitBehavior requires a rate limiter with a consume() method, such as RateLimiterMemory of rate-limiter-flexible.',
      );
    }
    this.defaults = defaults ?? {};

    this.logger = logger ?? console;
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options = this.resolveEffectiveOptions(
      context.getBehaviorOptions<RateLimitBehaviorOptions>(RateLimitBehavior),
    );
    const points = resolvePoints(context, options);
    if (points === 0) return next();

    const limiter = options.limiter ?? this.limiter;
    const key = buildRateLimitKey(context, options);
    setPipelineItem(context, RATE_LIMIT_KEY_ITEM_TOKEN, key);

    try {
      const result = await limiter.consume(key, points);
      setPipelineItem(context, RATE_LIMIT_ITEM_TOKEN, result);
    } catch (error) {
      if (!isRateLimiterRes(error)) {
        this.reportStoreError(error, { context, options, key });
        return next();
      }
      setPipelineItem(context, RATE_LIMIT_ITEM_TOKEN, error);
      throw new RateLimitExceededError({
        key,
        requestName: context.requestName,
        msBeforeNext: error.msBeforeNext,
        remainingPoints: error.remainingPoints,
        limit: limiter.points,
        points,
      });
    }

    return next();
  }

  /** Logs a failure of the backing store, and rethrows it unless failing open (default). */
  private reportStoreError(error: unknown, check: RateLimitCheck): void {
    const { context, options, key } = check;
    const message = error instanceof Error ? error.message : String(error);
    const failOpen = options.failOpen ?? true;

    this.logger[failOpen ? 'warn' : 'error']?.(
      `Rate limiter store error for ${context.requestName} ` +
        `(key: ${key}); failing ${failOpen ? 'open' : 'closed'}: ${message}`,
      RateLimitBehavior.name,
    );
    if (!failOpen) throw error;
  }

  /** Shallow-merges pipeline-level options over the constructor defaults. */
  resolveEffectiveOptions(
    options?: RateLimitBehaviorOptions,
  ): RateLimitBehaviorOptions {
    if (!options) return this.defaults;
    return { ...this.defaults, ...options };
  }
}

function isValidPoints(points: unknown): points is number {
  return Number.isSafeInteger(points) && (points as number) >= 0;
}

/**
 * Resolves the request's cost: the `points` option, computed when it is a
 * function, `1` when omitted.
 *
 * @throws {TypeError} When the cost is not a non-negative safe integer.
 */
function resolvePoints(
  context: IPipelineContext,
  options: RateLimitBehaviorOptions,
): number {
  const points =
    typeof options.points === 'function'
      ? options.points(context)
      : (options.points ?? 1);
  if (!isValidPoints(points)) {
    throw new TypeError(
      `Rate-limit points for ${context.handlerName} must be a non-negative safe integer, received ${String(points)}.`,
    );
  }
  return points;
}
