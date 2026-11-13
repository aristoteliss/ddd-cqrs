/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  createPipelineItem,
  type IPipelineBehavior,
  type IPipelineBehaviorContract,
  type IPipelineBehaviorOptionsResolver,
  type IPipelineContext,
  type NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
  type PipelineBehaviorDiagnostic,
  type PipelineBehaviorValidationContext,
  type PipelineItemToken,
  type PipelineLogger,
  setPipelineItem,
} from '@cqrs-ddd/pipeline';
import { uuidv7 } from '@cqrs-ddd/uuidv7';
import {
  buildAuditRecord,
  buildAuditStartRecord,
} from './helpers/build-record.js';
import type { AuditBehaviorOptions } from './interfaces/audit-options.interface.js';
import type {
  AuditRecord,
  AuditRequestKind,
  AuditStartRecord,
} from './interfaces/audit-record.interface.js';
import type { AuditSink } from './interfaces/audit-sink.interface.js';

/**
 * The `context.items` entry that holds the produced {@link AuditRecord}.
 *
 * Read it with `getPipelineItem` or `requirePipelineItem`.
 */
export const AUDIT_RECORD_ITEM_TOKEN: PipelineItemToken<AuditRecord> =
  createPipelineItem<AuditRecord>('AUDIT_RECORD_ITEM');

/**
 * Typed token for the pending {@link AuditStartRecord}, set before the handler
 * runs when a start record is written. A step inside the handler can read it,
 * for example to store the record in its own transaction.
 */
export const AUDIT_START_RECORD_ITEM_TOKEN: PipelineItemToken<AuditStartRecord> =
  createPipelineItem<AuditStartRecord>('AUDIT_START_RECORD_ITEM');

/** The request being audited: what its start record and its final record share. */
interface AuditedRequest {
  context: IPipelineContext;
  options: AuditBehaviorOptions;
  id: string;
  startedAt: string;
}

/**
 * Pipeline behavior that writes an {@link AuditRecord} for every audited
 * request — **on both success and failure** — to a pluggable {@link AuditSink}.
 * Only commands are audited unless `captureKinds` lists other request kinds.
 *
 * For each run it times the handler, resolves the actor and action, redacts the
 * payload (and optionally the response), then forwards the record. When the
 * sink implements `begin`, a pending start record is written first under the
 * same id, so a process stop during the handler leaves a pending record
 * instead of none; with `failOpen: false`, a failed start write stops the
 * request before its handler runs. Handler
 * failures are recorded before propagation. With the default `failOpen: true`,
 * sink failures are logged and the original handler result/error is preserved.
 * With `failOpen: false`, a sink/build failure on the **success path** fails the
 * request. If the handler already failed, the caller receives the handler's own
 * error, unchanged, and the audit failure is logged.
 *
 * Sink-agnostic by design: it depends only on {@link AuditSink}, so the backend
 * (console, Postgres, an event store, …) is a one-line swap: the sink passed
 * to the constructor. Record-building failures are logged and ignored
 * in fail-open mode, or propagated according to the same fail-closed semantics.
 *
 * **Ordering:** place this near the **outside** of the chain (e.g. global
 * `before`) so the duration covers the whole handler, and after any auth
 * behavior that populates `context.items` for the {@link AuditBehaviorOptions.actor}
 * factory.
 *
 * @example Per-handler, with an actor read from an upstream auth behavior
 * ```ts
 * class DeleteUserHandler {
 *   @pipeline.wrap({ kind: 'command' }, [AuditBehavior, {
 *     action: 'user.delete',
 *     severity: 'high',
 *     actor: (c) => ({ id: c.items.get('currentUserId') }),
 *   }])
 *   async handle(command: DeleteUserCommand) {}
 * }
 * ```
 *
 * @example Compliance-sensitive fail-closed auditing
 * ```ts
 * class RefundPaymentHandler {
 *   @pipeline.wrap({ kind: 'command' }, [AuditBehavior, {
 *     action: 'payment.refund',
 *     failOpen: false,
 *     captureResponse: false,
 *   }])
 *   async handle(command: RefundPaymentCommand) {}
 * }
 * ```
 */
export class AuditBehavior
  implements
    IPipelineBehavior,
    IPipelineBehaviorOptionsResolver<AuditBehaviorOptions>
{
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    validate: (
      context: PipelineBehaviorValidationContext,
    ): PipelineBehaviorDiagnostic[] | undefined => {
      const invalid = findInvalidFactory(
        (context.effectiveOptions ?? {}) as AuditBehaviorOptions,
      );
      if (!invalid) return undefined;
      return [
        {
          handlerName: context.handlerName,
          behaviorName: AuditBehavior.name,
          message: invalid,
          fix: 'Pass functions for the actor, metadata and redact options of AuditBehavior.',
        },
      ];
    },
  };

  private readonly logger: PipelineLogger;
  private readonly defaults: AuditBehaviorOptions;

  constructor(
    private readonly sink: AuditSink,
    defaults?: AuditBehaviorOptions,
    logger?: PipelineLogger,
  ) {
    if (typeof sink?.write !== 'function') {
      throw new TypeError(
        'AuditBehavior requires an audit sink with a write() method, such as new LogAuditSink().',
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
      context.getBehaviorOptions<AuditBehaviorOptions>(AuditBehavior),
    );

    const captureKinds = options.captureKinds ?? DEFAULT_CAPTURE_KINDS;
    if (!captureKinds.includes(context.requestKind)) {
      return next();
    }

    const failOpen = options.failOpen ?? true;
    this.validateFactories(options, failOpen);

    const startedAt = new Date().toISOString();
    const audited: AuditedRequest = {
      context,
      options,
      id: uuidv7(),
      startedAt,
    };
    const begin =
      options.recordStart === false
        ? undefined
        : this.sink.begin?.bind(this.sink);
    if (begin) await this.begin(begin, audited);

    return this.run(next, audited);
  }

  /**
   * Builds the start record, stashes it on the context and forwards it to the
   * sink's `begin`. Throws only when failing closed, before the handler runs.
   */
  private begin(
    begin: (record: AuditStartRecord) => Promise<void> | void,
    input: AuditedRequest,
  ): Promise<void> {
    return this.emit(input, {
      label: 'audit start record',
      build: () => buildAuditStartRecord(input),
      token: AUDIT_START_RECORD_ITEM_TOKEN,
      write: begin,
    });
  }

  /**
   * Times the handler and records its outcome. When the handler fails, the
   * caller receives its own error, whatever happens to the audit record.
   */
  private async run(
    next: NextDelegate,
    audited: AuditedRequest,
  ): Promise<unknown> {
    const start = performance.now();

    let response: unknown;
    try {
      response = await next();
    } catch (error) {
      try {
        await this.record({
          ...audited,
          error,
          failed: true,
          durationMs: performance.now() - start,
        });
      } catch (recordError) {
        this.diagnose(
          'error',
          `Audit recording also failed after request error: ${errorMessage(recordError)}`,
        );
      }
      throw error;
    }

    await this.record({
      ...audited,
      response,
      failed: false,
      durationMs: performance.now() - start,
    });

    return response;
  }

  /** Builds the record, stashes it on the context and forwards it to the sink. */
  private record(
    input: AuditedRequest & {
      response?: unknown;
      error?: unknown;
      failed: boolean;
      durationMs: number;
    },
  ): Promise<void> {
    return this.emit(input, {
      label: 'audit record',
      build: () => buildAuditRecord(input),
      token: AUDIT_RECORD_ITEM_TOKEN,
      write: (record) => this.sink.write(record),
    });
  }

  /**
   * One audit emission: a build or a write that fails is logged, and rethrown
   * only when the handler fails closed. Nothing is written after a failed build.
   */
  private async emit<
    TRecord extends { requestName: string; correlationId: string },
  >(
    { context, options }: AuditedRequest,
    emission: {
      label: string;
      build: () => TRecord;
      token: PipelineItemToken<TRecord>;
      write: (record: TRecord) => Promise<void> | void;
    },
  ): Promise<void> {
    const { label, build, token, write } = emission;
    const failOpen = options.failOpen ?? true;
    let record: TRecord;
    try {
      record = build();
    } catch (error) {
      this.reportFailure(
        `Failed to build ${label} for ${context.requestName}: ${errorMessage(error)}`,
        failOpen,
        error,
      );
      return;
    }

    setPipelineItem(context, token, record);

    try {
      await write(record);
    } catch (error) {
      this.reportFailure(
        `Failed to write ${label} for ${record.requestName} ` +
          `(correlationId: ${record.correlationId}): ${errorMessage(error)}`,
        failOpen,
        error,
      );
    }
  }

  /**
   * Rejects a non-function factory option before request execution when
   * `failOpen` is false, and logs it otherwise.
   */
  private validateFactories(
    options: AuditBehaviorOptions,
    failOpen: boolean,
  ): void {
    const invalid = findInvalidFactory(options);
    if (invalid) this.reportFailure(invalid, failOpen, new TypeError(invalid));
  }

  /** Logs an audit failure, then fails open or rethrows `error`. */
  private reportFailure(
    message: string,
    failOpen: boolean,
    error: unknown,
  ): void {
    if (failOpen) {
      this.diagnose('warn', `${message}; failing open`);
      return;
    }
    this.diagnose('error', `${message}; failing closed`);
    throw error;
  }

  /** Diagnostic logging never changes the request outcome. */
  private diagnose(level: 'warn' | 'error', message: string): void {
    try {
      this.logger[level]?.(message, AuditBehavior.name);
    } catch {
      // A failing logger must not override the fail-open/fail-closed decision.
    }
  }

  /** Shallow-merges per-handler options over the constructor defaults. */
  resolveEffectiveOptions(
    options?: AuditBehaviorOptions,
  ): AuditBehaviorOptions {
    if (!options) return this.defaults;
    return { ...this.defaults, ...options };
  }
}

/**
 * Kinds audited when `captureKinds` is omitted: commands, which change state.
 * A query changes nothing, and a domain event follows a command that is
 * already audited.
 */
const DEFAULT_CAPTURE_KINDS: readonly AuditRequestKind[] = ['command'];

const FACTORY_OPTIONS = [
  ['actor', 'actor factory'],
  ['metadata', 'metadata factory'],
  ['redact', 'redactor'],
] as const;

function errorMessage(error: unknown): unknown {
  return error instanceof Error ? error.message : error;
}

function findInvalidFactory(options: AuditBehaviorOptions): string | undefined {
  for (const [option, label] of FACTORY_OPTIONS) {
    const value = options[option];
    if (value !== undefined && typeof value !== 'function') {
      return `Invalid audit ${label}: expected a function, received ${typeof value}`;
    }
  }
  return undefined;
}
