/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { randomUUID } from 'node:crypto';
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
import { untyped } from '@cqrs-ddd/untyped';
import { DEFAULT_IDEMPOTENCY_TTL_MS } from './constants/tokens.js';
import { IdempotencyCompletionError } from './errors/idempotency-completion.error.js';
import {
  IdempotencyConflictError,
  type IdempotencyConflictReason,
} from './errors/idempotency-conflict.error.js';
import { fingerprintValue } from './helpers/fingerprint.js';
import { toJsonSnapshot } from './helpers/json-snapshot.js';
import type { IdempotencyBehaviorOptions } from './interfaces/idempotency-options.interface.js';
import type {
  IdempotencyRecord,
  IdempotencyRequestKind,
  JsonValue,
} from './interfaces/idempotency-record.interface.js';
import type { IdempotencyStore } from './interfaces/idempotency-store.interface.js';

/**
 * The `context.items` entry holding the active idempotency key string.
 *
 * Read it with `getPipelineItem` or `requirePipelineItem`.
 */
export const IDEMPOTENCY_KEY_ITEM_TOKEN: PipelineItemToken<string> =
  createPipelineItem<string>('IDEMPOTENCY_KEY_ITEM');

/**
 * The `context.items` entry to `true` when the response was replayed
 * from a previously-stored record (the handler did not run this time).
 *
 * Read it with `getPipelineItem` or `requirePipelineItem`.
 */
export const IDEMPOTENCY_REPLAYED_ITEM_TOKEN: PipelineItemToken<boolean> =
  createPipelineItem<boolean>('IDEMPOTENCY_REPLAYED_ITEM');

/**
 * The `context.items` entry to `true` when a handler completed after
 * its claim had expired or been replaced. The successful handler result is returned,
 * but this execution is not allowed to overwrite the newer owner's replay state.
 *
 * Read it with `getPipelineItem` or `requirePipelineItem`.
 */
export const IDEMPOTENCY_OWNERSHIP_LOST_ITEM_TOKEN: PipelineItemToken<boolean> =
  createPipelineItem<boolean>('IDEMPOTENCY_OWNERSHIP_LOST_ITEM');

const DEFAULT_SCOPE: IdempotencyRequestKind[] = ['command'];

/** Whether this request kind is configured for idempotency. */
function inScope(
  options: IdempotencyBehaviorOptions | undefined,
  requestKind: IPipelineContext['requestKind'],
): boolean {
  return (options?.scope ?? DEFAULT_SCOPE).includes(
    requestKind as IdempotencyRequestKind,
  );
}

/**
 * One execution's claim on its key, with what the replay checks and the
 * completion of that claim need.
 */
interface ClaimAttempt {
  /** The in-progress record: key, claim id, fingerprint and replay scope. */
  claim: IdempotencyRecord & { claimId: string };
  ttl: number;
  scopeRequired: boolean;
  releaseOnError: boolean;
}

/**
 * Pipeline behavior that deduplicates concurrent requests sharing an
 * idempotency key and replays the stored response after a successful execution.
 *
 * For each in-scope request it derives a key
 * ({@link IdempotencyBehaviorOptions.keyFactory}), then atomically claims it in
 * a pluggable {@link IdempotencyStore}:
 *
 * - **first claim** → run the handler and store the completed response;
 * - **duplicate, completed** → return the stored response (no re-execution);
 * - **duplicate, in progress** → throw {@link IdempotencyConflictError} (`409`);
 * - **key reused with a different payload** → throw it as `key_reuse` (`422`);
 * - **completed under a different authorization scope** → throw it as
 *   `replay_scope` (`409`), when a
 *   {@link IdempotencyBehaviorOptions.replayScopeFactory} is configured. The
 *   record is kept and the handler is not re-executed, so a permission change
 *   cannot duplicate the effect.
 *
 * Each claim carries a unique owner token. Completion and release compare that
 * token atomically, so an execution that outlives its TTL cannot overwrite or
 * delete a newer claim after the key is reclaimed.
 *
 * When the handler throws, `releaseOnError` controls whether the key remains
 * claimed. It defaults to `true`, so failed executions release the key and a
 * later retry may execute the handler again. Set it to `false` when retaining
 * the claim after a failure is preferable to retryability.
 *
 * Store-agnostic by design: memory, Redis, Postgres, or your own are one-line
 * swaps of the store passed to the constructor, which requires one. When no key is produced,
 * the handler runs normally.
 *
 * @example Per-handler idempotency
 * Keyed off an optional `Idempotency-Key` header and partitioned by tenant and principal:
 * ```ts
 * class CreatePaymentHandler {
 *   @pipeline.wrap({ kind: 'command' }, [IdempotencyBehavior, {
 *     keyFactory: createPartitionedIdempotencyKeyFactory({
 *       principal: (c) => c.items.get('currentUserId') as string | undefined,
 *       operation: (c) => c.items.get('idempotencyKey') as string | undefined,
 *       onMissingOperation: 'skip',
 *     }),
 *     ttl: 86_400_000,
 *   }])
 *   async handle(command: CreatePaymentCommand) {}
 * }
 * ```
 */
export class IdempotencyBehavior
  implements
    IPipelineBehavior,
    IPipelineBehaviorOptionsResolver<IdempotencyBehaviorOptions>
{
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    order: ({ effectiveOptions, requestKind }) =>
      inScope(
        effectiveOptions as IdempotencyBehaviorOptions | undefined,
        requestKind,
      )
        ? { after: ['@cqrs-ddd/pipeline-casl:CaslBehavior', 'CaslBehavior'] }
        : undefined,
    validate: (context) => {
      const options = context.effectiveOptions as
        | IdempotencyBehaviorOptions
        | undefined;
      if (!inScope(options, context.requestKind)) return undefined;

      const isDeclaredByHandler = context.declarationSource !== 'global';
      if (isDeclaredByHandler && !options?.keyFactory) {
        return behaviorDiagnostic(context, IdempotencyBehavior.name, {
          message:
            'Explicit IdempotencyBehavior intent requires an explicit `keyFactory` for deduplication',
          fix:
            'Provide keyFactory in the idempotent({ keyFactory }) entry ' +
            'or use createPartitionedIdempotencyKeyFactory(...).',
        });
      }
      if (options?.keyFactory && typeof options.keyFactory !== 'function') {
        return behaviorDiagnostic(context, IdempotencyBehavior.name, {
          message: `IdempotencyBehavior keyFactory must be a callable function, received ${typeof options.keyFactory}`,
          fix: 'Pass a valid function (ctx) => string as the keyFactory option of the idempotent({ keyFactory }) entry.',
        });
      }
      return undefined;
    },
  };

  private readonly logger: PipelineLogger;
  private readonly defaults: IdempotencyBehaviorOptions;

  constructor(
    private readonly store: IdempotencyStore,
    defaults?: IdempotencyBehaviorOptions,
    logger?: PipelineLogger,
  ) {
    const candidate = untyped(this.store ?? {});
    if (
      typeof candidate.completeIfOwned !== 'function' ||
      typeof candidate.deleteIfOwned !== 'function'
    ) {
      throw new TypeError(
        'The configured IdempotencyStore is missing required methods. ' +
          'IdempotencyStore requires atomic completeIfOwned() and deleteIfOwned() operations.',
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
      context.getBehaviorOptions<IdempotencyBehaviorOptions>(
        IdempotencyBehavior,
      ),
    );

    if (!inScope(options, context.requestKind)) {
      return next();
    }

    const key = options.keyFactory?.(context);
    if (!key) {
      // No idempotency key → nothing to dedupe; run normally.
      return next();
    }

    setPipelineItem(context, IDEMPOTENCY_KEY_ITEM_TOKEN, key);

    const attempt = this.prepareClaim(context, options, key);
    const claimed = await this.store.setIfAbsent(
      key,
      attempt.claim,
      attempt.ttl,
    );
    if (!claimed) {
      return this.replayOrReclaim(context, attempt, next);
    }
    return this.run(context, attempt, next);
  }

  /**
   * Builds this execution's in-progress claim. Every refusal of the options
   * and the request happens here, before the key is claimed.
   */
  private prepareClaim(
    context: IPipelineContext,
    options: IdempotencyBehaviorOptions,
    key: string,
  ): ClaimAttempt {
    return {
      ttl: ttlOf(options),
      scopeRequired: options.replayScopeFactory !== undefined,
      releaseOnError: options.releaseOnError ?? true,
      claim: {
        key,
        status: 'in_progress',
        requestName: context.requestName,
        claimId: randomUUID(),
        fingerprint:
          (options.fingerprint ?? true)
            ? fingerprintValue(context.request)
            : undefined,
        // Resolved before the claim, so a replayScopeFactory that throws rejects
        // the operation before any key is claimed.
        replayScope: options.replayScopeFactory?.(context),
        createdAt: new Date().toISOString(),
      },
    };
  }

  private async replayOrReclaim(
    context: IPipelineContext,
    attempt: ClaimAttempt,
    next: NextDelegate,
  ): Promise<unknown> {
    const { key } = attempt.claim;
    const existing = await this.store.get(key);
    if (existing) {
      return this.replayOrConflict(context, attempt, existing);
    }

    // The record disappeared or expired after the failed claim. Give this
    // request one bounded opportunity to claim the now-available key instead
    // of reporting a false in-progress conflict.
    const claimed = await this.store.setIfAbsent(
      key,
      attempt.claim,
      attempt.ttl,
    );
    if (!claimed) {
      return this.replayOrConflict(context, attempt);
    }
    return this.run(context, attempt, next);
  }

  /** Runs the handler under this execution's claim, then completes the claim. */
  private async run(
    context: IPipelineContext,
    attempt: ClaimAttempt,
    next: NextDelegate,
  ): Promise<unknown> {
    let response: unknown;
    try {
      response = await next();
    } catch (error) {
      if (attempt.releaseOnError) {
        await this.release(attempt.claim.key, attempt.claim.claimId);
      }
      throw error;
    }

    const responseSnapshot = this.snapshot(context, attempt, response);
    await this.complete(context, attempt, responseSnapshot);

    return response;
  }

  /** The replayable JSON snapshot of a successful handler's response. */
  private snapshot(
    context: IPipelineContext,
    attempt: ClaimAttempt,
    response: unknown,
  ): JsonValue | undefined {
    const { key, claimId } = attempt.claim;
    try {
      return toJsonSnapshot(response);
    } catch (cause) {
      // The handler already succeeded, so retain the claim until expiry rather
      // than allowing an immediate retry to repeat completed side effects.
      this.logger.error?.(
        `Idempotency response snapshot failed after ${context.requestName} ` +
          `executed successfully (key: ${key}). The claim is retained until it ` +
          'expires; retrying the business request may repeat side effects.',
        (cause as TypeError).stack,
        IdempotencyBehavior.name,
      );
      throw new IdempotencyCompletionError(key, claimId, cause, 'snapshot');
    }
  }

  /**
   * Stores the completed record while this execution still owns the claim, and
   * flags the context when a newer claim replaced it.
   */
  private async complete(
    context: IPipelineContext,
    attempt: ClaimAttempt,
    responseSnapshot: JsonValue | undefined,
  ): Promise<void> {
    const { key, claimId } = attempt.claim;
    // The handler has already succeeded. Completion must be conditional on
    // still owning the claim; a stale execution must never overwrite a newer
    // execution that reclaimed the key after this claim's TTL elapsed.
    let completed: boolean;
    try {
      completed = await this.store.completeIfOwned(
        key,
        claimId,
        {
          ...attempt.claim,
          status: 'completed',
          response: responseSnapshot,
          completedAt: new Date().toISOString(),
        },
        attempt.ttl,
      );
    } catch (cause) {
      this.logger.error?.(
        `Idempotency completion persistence failed after ${context.requestName} ` +
          `executed successfully (key: ${key}). Retrying the business request may ` +
          'repeat side effects.',
        cause instanceof Error ? cause.stack : undefined,
        IdempotencyBehavior.name,
      );
      throw new IdempotencyCompletionError(key, claimId, cause, 'store');
    }

    if (!completed) {
      setPipelineItem(context, IDEMPOTENCY_OWNERSHIP_LOST_ITEM_TOKEN, true);
      this.logger.error?.(
        `Idempotency claim ownership was lost after ${context.requestName} ` +
          `completed successfully (key: ${key}). The successful result is being ` +
          'returned, but this execution did not overwrite the newer claim.',
        IdempotencyBehavior.name,
      );
    }
  }

  /**
   * The key was already claimed. Replay a completed response, or surface a
   * conflict for an in-progress duplicate, a key reused with a new payload, or a
   * completed record whose replay scope does not match the caller's.
   */
  private async replayOrConflict(
    context: IPipelineContext,
    attempt: ClaimAttempt,
    knownExisting?: IdempotencyRecord,
  ): Promise<unknown> {
    const existing = knownExisting ?? (await this.store.get(attempt.claim.key));
    this.refuseReplay(context, attempt, existing);

    setPipelineItem(context, IDEMPOTENCY_REPLAYED_ITEM_TOKEN, true);
    this.logger.debug?.(
      `Replaying idempotent response for ${context.requestName} (key: ${attempt.claim.key})`,
      IdempotencyBehavior.name,
    );

    return existing.response;
  }

  /** Throws the conflict that forbids replaying `existing` to this caller. */
  private refuseReplay(
    context: IPipelineContext,
    attempt: ClaimAttempt,
    existing: IdempotencyRecord | undefined,
  ): asserts existing is IdempotencyRecord {
    const { key, fingerprint, replayScope } = attempt.claim;

    // A second failed claim followed by another disappearing record indicates
    // repeated contention. The retry is deliberately bounded to avoid a hot
    // loop if a backend is unstable or claims are being rapidly replaced.
    if (!existing) {
      throw conflict(context, key, 'in_progress');
    }

    // A fingerprinted request never replays a record that cannot prove payload identity.
    if (
      existing.requestName !== context.requestName ||
      (fingerprint && existing.fingerprint !== fingerprint)
    ) {
      throw conflict(context, key, 'key_reuse');
    }

    if (existing.status === 'in_progress') {
      throw conflict(context, key, 'in_progress');
    }

    // A completed record may only be replayed to a caller whose authorization
    // scope matches the one it was produced under. A record stored without a
    // scope cannot prove that, so it fails closed rather than replaying. The
    // record is retained: re-executing a completed operation would duplicate it.
    if (
      attempt.scopeRequired &&
      (existing.replayScope === undefined ||
        existing.replayScope !== replayScope)
    ) {
      this.logger.warn?.(
        `Refusing to replay ${context.requestName} (key: ${key}): the stored ` +
          'response was authorized under a different scope than this caller.',
        IdempotencyBehavior.name,
      );
      throw conflict(context, key, 'replay_scope');
    }
  }

  /**
   * Release a failed execution's claim only if it still owns the key; never let
   * cleanup break propagation of the original handler error.
   */
  private async release(key: string, claimId: string): Promise<void> {
    try {
      await this.store.deleteIfOwned(key, claimId);
    } catch (error) {
      this.logger.warn?.(
        `Failed to release idempotency key "${key}": ` +
          `${error instanceof Error ? error.message : error}`,
        IdempotencyBehavior.name,
      );
    }
  }

  /** Shallow-merges pipeline-level options over the constructor defaults. */
  resolveEffectiveOptions(
    options?: IdempotencyBehaviorOptions,
  ): IdempotencyBehaviorOptions {
    if (!options) return this.defaults;
    return { ...this.defaults, ...options };
  }
}

function ttlOf(options: IdempotencyBehaviorOptions): number {
  const ttl = options.ttl ?? DEFAULT_IDEMPOTENCY_TTL_MS;
  if (!Number.isSafeInteger(ttl) || ttl <= 0) {
    throw new TypeError(
      'Idempotency ttl must be a positive safe integer in milliseconds.',
    );
  }
  return ttl;
}

function conflict(
  context: IPipelineContext,
  key: string,
  reason: IdempotencyConflictReason,
): IdempotencyConflictError {
  return new IdempotencyConflictError({
    key,
    requestName: context.requestName,
    reason,
  });
}
