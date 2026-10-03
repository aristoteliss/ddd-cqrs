/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Constructor, IPipelineContext } from '@cqrs-ddd/pipeline';
import type { DeadLetterRequestKind } from './dead-letter-transport.interface.js';

/**
 * Factory producing extra, request-aware metadata to attach to a dead letter
 * (e.g. tenant id, user id, attempt count read from `context.items`).
 */
export type DeadLetterMetadataFactory = (
  context: IPipelineContext,
) => Record<string, unknown>;

/**
 * Per-handler (and constructor-default) options for {@link DeadLetterBehavior}.
 *
 * Supplied per handler via
 * `pipeline.wrap(options, [DeadLetterBehavior, { ... }])`, shallow-merged over
 * the constructor defaults (handler keys win), except that `ignoreErrors` and
 * `redactKeys` set at both levels are combined.
 *
 * @example Fire-and-forget event capture
 * ```ts
 * class UserCreatedHandler {
 *   @pipeline.wrap({ kind: 'event' }, [DeadLetterBehavior, {
 *     captureKinds: ['event'],
 *     rethrow: false,
 *     redactKeys: ['token'],
 *   }])
 *   async handle(event: UserCreatedEvent) {}
 * }
 * ```
 */
export interface DeadLetterBehaviorOptions {
  /**
   * Whether to re-throw the original error after dead-lettering.
   *
   * - `true` (default) — propagate after the capture decision; the caller sees the
   *   failure (HTTP 5xx, command rejection, …). Use for commands/queries.
   * - `false` — on an **event** handler only, swallow the error when it is
   *   captured and the transport delivers it; the pipeline then resolves to
   *   `undefined` and the swallow is logged at `error` level with the record id.
   *   On a command or query handler it is a contract diagnostic and is ignored.
   */
  rethrow?: boolean;

  /**
   * Include the error stack trace in the record. Default `true`.
   * Set `false` to keep records lean or avoid leaking internals downstream.
   */
  includeStack?: boolean;

  /**
   * Request kinds to capture. Default `['event']`: a command's or query's
   * caller already receives the error. Example: `['command', 'event']` to also
   * keep failed commands.
   */
  captureKinds?: DeadLetterRequestKind[];

  /**
   * Filter predicate or error types to ignore.
   * Matching errors are re-thrown without being sent to the dead-letter transport.
   * Useful for ignoring expected client validation errors (e.g. ZodValidationError).
   */
  ignoreErrors?:
    | Array<Constructor<unknown> | (abstract new (...args: never[]) => unknown)>
    | ((error: unknown, context: IPipelineContext) => boolean);

  /** Produce extra metadata to merge into the dead-letter record. */
  metadata?: DeadLetterMetadataFactory;

  /**
   * Custom redactor function for the captured request payload.
   * When supplied, takes precedence over {@link redactKeys}.
   */
  redact?: (payload: unknown) => unknown;

  /**
   * Field names to mask with `[REDACTED]` in the captured request payload.
   * Case-insensitive matching. Merged on top of {@link DEFAULT_REDACT_KEYS}.
   */
  redactKeys?: string[];
}
