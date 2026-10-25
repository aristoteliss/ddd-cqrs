/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { performance } from 'node:perf_hooks';
import {
  DEFAULT_REDACT_KEYS,
  type SanitizeOptions,
  safeSanitize,
  safeStringify,
} from '@cqrs-ddd/safe-stringify';
import {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface.js';
import { IPipelineContext } from '../interfaces/pipeline.context.interface.js';
import type { LogLevel, PipelineLogger } from '../logger.js';

/**
 * An error class used as a `mapLogLevel` key. It is matched with `instanceof`, so
 * it also covers its subclasses.
 */
export type ErrorClass = abstract new (...args: never[]) => Error;

/**
 * Configuration options for the logging behavior.
 *
 * Levels use {@link LogLevel} names (`'verbose'`, `'debug'`, `'log'`,
 * `'warn'`, `'error'`, `'fatal'`).
 * When using `nestjs-pino`, these map to pino levels:
 * `'verbose'` → `trace`, `'debug'` → `debug`, `'log'` → `info`, `'warn'` → `warn`,
 * `'error'` → `error`, `'fatal'` → `fatal`.
 * Use `'none'` to suppress a message entirely.
 *
 * @example Structured application logging with safe payload visibility
 * ```ts
 * export const createUser = pipeline.wrap(
 *   { name: 'createUser', kind: 'command' },
 *   [LoggingBehavior, {
 *     logFormat: 'structured',
 *     requestResponseLogLevel: 'debug',
 *     excludeRequestObj: false,
 *     excludeResponseObj: true,
 *     redactKeys: ['code'],
 *     mapLogLevel: new Map([[UniqueEmailException, 'warn']]),
 *   }],
 * )(async (command: CreateUserCommand) => users.create(command));
 * ```
 */
export interface LoggingBehaviorOptions {
  /**
   * Log level for the post-success metric line (correlation ID, request
   * kind/name, handler name, and elapsed duration in ms). Emitted once
   * `next()` resolves without throwing.
   * Uses LogLevel names or 'none' to suppress.
   * Default: 'log'.
   */
  metricLogLevel?: LogLevel | 'none';

  /**
   * Log level used when the wrapped handler throws.
   * Uses LogLevel names or 'none' to suppress.
   * Overridden per error type when `mapLogLevel` has a matching entry.
   * Default: 'error'.
   */
  errorLogLevel?: LogLevel | 'none';

  /**
   * Per-exception-type log level override, keyed by error class.
   *
   * When the thrown error is an `instanceof` more than one registered key,
   * the most specific (most derived) matching class wins — e.g. with both
   * `Error` and `ForbiddenException` registered, a thrown `ForbiddenException`
   * logs at the `ForbiddenException` level, regardless of the order the
   * entries were inserted into the Map. Falls back to `errorLogLevel` when
   * no key matches.
   * Example: `new Map([[Error, 'error'], [ForbiddenException, 'warn']])`
   */
  mapLogLevel?: Map<ErrorClass, LogLevel | 'none'>;

  /**
   * Log level for request/response payloads.
   * Uses LogLevel names or 'none' to suppress.
   * Default: 'debug'.
   */
  requestResponseLogLevel?: LogLevel | 'none';

  /**
   * Keys to exclude from request/response logs.
   * Passed to `safeStringify`/`safeSanitize` as a `Set<string>` for filtering object properties.
   * Supports dot notation for nested properties (e.g. `'ctx.sessionUser'`).
   * Example: `['password', 'token', 'ctx.sessionUser']` omits those fields from the log output.
   * Default: [] (no keys excluded).
   */
  excludeKeys?: string[];

  /**
   * Additional keys or dot-paths to mask with `[REDACTED]` when request/response
   * payload logging is enabled. Unlike {@link excludeKeys}, redacted properties
   * stay in the payload so its shape remains visible.
   *
   * This option is additive and has no effect unless configured.
   *
   * @example
   * ```ts
   * logging({
   *   excludeRequestObj: false,
   *   redactKeys: ['profile.email', 'payment.cardToken'],
   * });
   * ```
   */
  redactKeys?: string[];

  /**
   * Masks the core {@link DEFAULT_REDACT_KEYS} (password, token, authorization,
   * cookie, API keys, card data, etc.) in request/response payload logs. Custom
   * {@link redactKeys} are merged on top.
   *
   * Defaults to `true`. Set it to `false` only when raw payload logging is an
   * explicit application requirement and the caller owns the resulting exposure
   * risk.
   *
   * @default true
   *
   * @example Opting out, deliberately
   * ```ts
   * logging({ excludeRequestObj: false, redactSensitiveKeys: false });
   * ```
   */
  redactSensitiveKeys?: boolean;

  /**
   * If true, omits the request payload from logs entirely, logging the
   * placeholder `'[exclude request obj]'` instead.
   * Default: true.
   */
  excludeRequestObj?: boolean;

  /**
   * If true, omits the response payload from logs entirely, logging the
   * placeholder `'[exclude response obj]'` instead.
   * Default: true.
   */
  excludeResponseObj?: boolean;

  /**
   * Output shape for request/response/metric/error logs.
   * - 'text': single interpolated string (default).
   * - 'structured': plain object payload (e.g. `{ msg, request }` for
   *   request/response, or `{ message, stack, ... }` for errors), suitable
   *   for structured loggers like nestjs-pino/pino that serialize objects
   *   into JSON fields.
   * Default: 'text'.
   */
  logFormat?: 'text' | 'structured';
}

/** An error carrying extra loggable context in `optionalParams`. */
interface ErrorWithOptionalParams {
  optionalParams?: unknown;
}

/**
 * Pipeline behavior that logs each request/response and execution timing.
 *
 * Emits the incoming request, a completion metric (duration), and the response,
 * each at a configurable log level (see `LoggingBehaviorOptions`). Request and
 * response payloads are excluded by default and can be opted in, with key-based
 * exclusion/redaction. Logging and serialization failures do not change the
 * handler result or error. If the wrapped handler throws,
 * the error is logged — including its stack trace and, when present, the error's
 * `optionalParams` (see `ErrorWithOptionalParams`) — and then re-thrown
 * unchanged. Writes through the logger passed to the constructor, or `console`.
 *
 * @example
 * ```ts
 * const pipeline = createPipeline({ behaviors: [new LoggingBehavior(pinoAdapter)] });
 * ```
 */
export class LoggingBehavior implements IPipelineBehavior {
  private readonly logger: PipelineLogger;

  constructor(logger?: PipelineLogger) {
    this.logger = logger ?? console;
  }

  /**
   * Logs the request, a duration metric, and the response or error around
   * `next()`, using the options from `context.getBehaviorOptions(LoggingBehavior)`
   * and the defaults documented on {@link LoggingBehaviorOptions}.
   *
   * @param context - The pipeline context for the current request.
   * @param next - Delegate that invokes the next behavior/handler in the chain.
   * @returns The value resolved by `next()`.
   * @throws Whatever `next()` throws, unchanged, after logging it. A logging
   *   or serialization failure never changes the returned value or the error.
   */
  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options =
      context.getBehaviorOptions<LoggingBehaviorOptions>(LoggingBehavior);
    const excludeKeys = new Set<string>(options?.excludeKeys);
    const sanitizeOptions = this.buildSanitizeOptions(options, excludeKeys);
    const execution = executionOf(context, options, sanitizeOptions);

    this.observe(() => {
      const request = requestLine(execution);
      if (request) this.log(...request);
    });

    const startTime = performance.now();

    try {
      const result = await next();
      this.observe(() => this.logSuccess(execution, result, startTime));

      return result;
    } catch (error) {
      this.observe(() => {
        const failure = failureOf(execution, error, startTime);
        this.log(...errorLine(failure, this.optionalParamsOf(error)));
      });

      throw error;
    }
  }

  private logSuccess(
    execution: LoggedExecution,
    result: unknown,
    startTime: number,
  ): void {
    this.log(...metricLine(execution, startTime));
    const response = responseLine(execution, result);
    if (response) this.log(...response);
  }

  private observe(write: () => void): void {
    try {
      write();
    } catch (error) {
      // Observability failures must not alter business execution or error
      // identity, but they must not be invisible either: a payload that always
      // throws would otherwise silence a handler's logging with no trace.
      try {
        this.log(
          'warn',
          `LoggingBehavior suppressed a log write: ${
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : 'unknown error'
          }`,
        );
      } catch {
        // The logger itself is unusable; nothing further is safe to attempt.
      }
    }
  }

  /**
   * Builds the sanitizer configuration for payload logging.
   *
   * The default sensitive keys are masked unless `redactSensitiveKeys` is
   * false; keys listed in `redactKeys` are always masked. With no key to mask,
   * only the exclusion set applies.
   */
  private buildSanitizeOptions(
    options: LoggingBehaviorOptions | undefined,
    excludeKeys: Set<string>,
  ): Set<string> | SanitizeOptions {
    const redactKeys = [
      ...(options?.redactSensitiveKeys === false ? [] : DEFAULT_REDACT_KEYS),
      ...(options?.redactKeys ?? []),
    ];

    if (redactKeys.length === 0) return excludeKeys;

    return {
      excludeKeys,
      redactKeys,
    };
  }

  /**
   * Dispatches `message` (and any `optionalParams`) to the logger method
   * matching `level` — e.g. `level: 'warn'` calls `this.logger.warn(...)`.
   * No-op when `level` is `'none'` or the underlying logger doesn't
   * implement that method.
   */
  private log(
    level: LogLevel | 'none',
    message: unknown,
    ...optionalParams: unknown[]
  ): void {
    if (level === 'none') return;

    const method = this.logger[level as keyof PipelineLogger];
    if (typeof method === 'function') {
      (
        method as (message: unknown, ...optionalParams: unknown[]) => unknown
      ).call(this.logger, message, ...optionalParams);
    }
  }

  /**
   * Extracts extra, loggable context from an error matching
   * `ErrorWithOptionalParams`: a non-null object exposing a defined
   * `optionalParams` property. `handle`'s `catch` branch uses this to decide
   * whether the error log should be enriched with that extra context.
   *
   * The value is normalized into an array so it can be spread into the error
   * log payload: passed through as-is if it's already an array, or wrapped in a
   * single-element array otherwise.
   *
   * @returns The normalized `optionalParams`, or `undefined` when the error is
   *   not an object or does not define `optionalParams`.
   */
  private optionalParamsOf(error: unknown): unknown[] | undefined {
    if (typeof error !== 'object' || error === null) return undefined;
    const { optionalParams } = error as ErrorWithOptionalParams;
    if (optionalParams === undefined) return undefined;
    return Array.isArray(optionalParams) ? optionalParams : [optionalParams];
  }
}

/** One execution's context, with its logging options resolved to their defaults. */
interface LoggedExecution {
  context: IPipelineContext;
  options: LoggingBehaviorOptions | undefined;
  metricLogLevel: LogLevel | 'none';
  requestResponseLogLevel: LogLevel | 'none';
  errorLogLevel: LogLevel | 'none';
  sanitizeOptions: Set<string> | SanitizeOptions;
  excludeRequestObj: boolean;
  excludeResponseObj: boolean;
  structured: boolean;
}

/** What a failed execution logs before the error's own `optionalParams`. */
interface Failure {
  execution: LoggedExecution;
  err: Error | undefined;
  level: LogLevel | 'none';
  message: string;
}

type LogLine = [
  level: LogLevel | 'none',
  message: unknown,
  ...optionalParams: unknown[],
];

function executionOf(
  context: IPipelineContext,
  options: LoggingBehaviorOptions | undefined,
  sanitizeOptions: Set<string> | SanitizeOptions,
): LoggedExecution {
  return {
    context,
    options,
    metricLogLevel: options?.metricLogLevel ?? 'log',
    requestResponseLogLevel: options?.requestResponseLogLevel ?? 'debug',
    errorLogLevel: options?.errorLogLevel ?? 'error',
    sanitizeOptions,
    excludeRequestObj: options?.excludeRequestObj ?? true,
    excludeResponseObj: options?.excludeResponseObj ?? true,
    structured: options?.logFormat === 'structured',
  };
}

function requestLine(execution: LoggedExecution): LogLine | undefined {
  const { context, requestResponseLogLevel, structured } = execution;
  if (requestResponseLogLevel === 'none') return undefined;
  const requestPayload = execution.excludeRequestObj
    ? '[exclude request obj]'
    : payloadOf(execution, context.request);

  return [
    requestResponseLogLevel,
    structured
      ? { msg: `Request → ${context.handlerName}`, request: requestPayload }
      : `Request: ${requestPayload}`,
    context.handlerName,
  ];
}

function payloadOf(execution: LoggedExecution, value: unknown): unknown {
  const { structured, sanitizeOptions } = execution;
  return structured
    ? safeSanitize(value, sanitizeOptions)
    : safeStringify(value, sanitizeOptions);
}

function metricLine(execution: LoggedExecution, startTime: number): LogLine {
  const { context, metricLogLevel, structured } = execution;
  const duration = (performance.now() - startTime).toFixed(2);

  const metricMsg =
    `[${context.correlationId}] ${context.requestKind.toUpperCase()} ` +
    `${context.requestName} → ${context.handlerName} completed in ${duration}ms`;

  return [
    metricLogLevel,
    structured
      ? {
          msg: metricMsg,
          correlationId: context.correlationId,
          requestKind: context.requestKind,
          requestName: context.requestName,
          handlerName: context.handlerName,
          durationMs: Number(duration),
        }
      : metricMsg,
    context.handlerName,
  ];
}

function responseLine(
  execution: LoggedExecution,
  result: unknown,
): LogLine | undefined {
  const { context, requestResponseLogLevel, structured } = execution;
  if (requestResponseLogLevel === 'none') return undefined;
  const responsePayload = responsePayloadOf(execution, result);

  return [
    requestResponseLogLevel,
    structured
      ? { msg: `Response ← ${context.handlerName}`, response: responsePayload }
      : `Response: ${responsePayload}`,
    context.handlerName,
  ];
}

function responsePayloadOf(
  execution: LoggedExecution,
  result: unknown,
): unknown {
  if (execution.excludeResponseObj) return '[exclude response obj]';
  if (result == null) return '(void)';
  return payloadOf(execution, result);
}

function failureOf(
  execution: LoggedExecution,
  error: unknown,
  startTime: number,
): Failure {
  const { context } = execution;
  const duration = (performance.now() - startTime).toFixed(2);
  const err = error instanceof Error ? error : undefined;
  const level = errorLevelOf(execution, error);

  const message =
    `[${context.correlationId}] ${context.requestKind.toUpperCase()} ` +
    `${context.requestName} → ${context.handlerName} failed after ${duration}ms: ` +
    `${err ? `${err.name}: ${err.message}` : String(error)}`;

  return { execution, err, level, message };
}

function errorLevelOf(
  execution: LoggedExecution,
  error: unknown,
): LogLevel | 'none' {
  const { options } = execution;
  let logLevel = execution.errorLogLevel;
  if (!options?.mapLogLevel) return logLevel;

  let bestMatch: ErrorClass | undefined;
  for (const [errorType, level] of options.mapLogLevel.entries()) {
    if (!(error instanceof errorType)) continue;
    if (!bestMatch || errorType.prototype instanceof bestMatch) {
      bestMatch = errorType;
      logLevel = level;
    }
  }

  return logLevel;
}

function errorLine(failure: Failure, params: unknown[] | undefined): LogLine {
  const { execution, err, level, message } = failure;
  const { context, sanitizeOptions } = execution;
  const optionalParams = params
    ? (safeSanitize(params, sanitizeOptions) as unknown[])
    : undefined;

  if (execution.structured) {
    const payload: Record<string, unknown> = {
      message,
      ...(err?.stack ? { stack: err.stack } : {}),
      ...(optionalParams ? { optionalParams } : {}),
    };
    return [level, payload, context.handlerName];
  }
  return [
    level,
    message,
    ...(err?.stack ? [err.stack] : []),
    ...(optionalParams ?? []),
    context.handlerName,
  ];
}
