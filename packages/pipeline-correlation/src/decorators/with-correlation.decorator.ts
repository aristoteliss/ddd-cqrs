/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { untyped } from '@cqrs-ddd/untyped';
import { DEFAULT_CORRELATION_HEADER } from '../constants/correlation.constants.js';
import {
  getCorrelationId,
  runWithCorrelationId,
} from '../correlation.store.js';
import {
  type DualMethodDecorator,
  methodDecorator,
} from '../helpers/method-decorator.js';
import { dyn } from '../types/safe-typing.js';

/**
 * A function that extracts the correlation ID from the method arguments.
 *
 * Receives the same arguments the decorated method receives.
 * Return `undefined` to keep the current id, or get a new one from
 * `correlationSource.create()` when there is none.
 */
export type CorrelationExtractor = (...args: unknown[]) => string | undefined;

/**
 * Options for the {@link WithCorrelation} decorator.
 */
export interface CorrelationDecoratorOptions {
  /**
   * Property path (dot-notation) to the correlation ID in the **first argument**.
   *
   * - For Bull: `'data.correlationId'` (default)
   * - For a flat object: `'correlationId'`
   * - For deeply nested: `'metadata.tracing.correlationId'`
   *
   * Ignored when `extract` is provided.
   *
   * @default 'data.correlationId'
   */
  path?: string;

  /**
   * Custom extractor function. Receives all method arguments.
   * Takes precedence over `path`.
   *
   * @example
   * ```ts
   * // RabbitMQ
   * extract: (data, ctx) => ctx.getMessage().properties.correlationId
   *
   * // Kafka
   * extract: (data, ctx) =>
   *   ctx.getMessage().headers?.['x-correlation-id']?.toString()
   * ```
   */
  extract?: CorrelationExtractor;

  /**
   * Log level for the start of the method execution.
   *
   * - Any {@link LogLevel} value routes to the logger method of that name (`'log'`, `'debug'`, `'verbose'`, `'warn'`, `'error'`).
   * - `'none'` suppresses the log message entirely.
   *
   * A pino-backed logger maps the levels as `'verbose'` → `trace`, `'debug'` → `debug`,
   * `'log'` → `info`, `'warn'` → `warn`, `'error'` → `error`, `'fatal'` → `fatal`.
   *
   * @default 'debug'
   *
   * @example
   * ```ts
   * // Uses default 'debug' level
   * @WithCorrelation()
   *
   * // Log at 'verbose' level
   * @WithCorrelation({ logLevel: 'verbose' })
   *
   * // Suppress the log message
   * @WithCorrelation({ logLevel: 'none' })
   * ```
   */
  logLevel?: LogLevel | 'none';

  /**
   * Logger to write through instead of the decorated instance's `logger` property or
   * `console`.
   *
   * Accepts any object with the methods of {@link CorrelationLogger}
   * (e.g. a Pino or Winston adapter).
   *
   * @example
   * ```ts
   * @WithCorrelation({ logger: myPinoLogger })
   * async handleJob(job: Job) { ... }
   * ```
   */
  logger?: CorrelationLogger;
}

/** The levels `@WithCorrelation` logs at, named as NestJS names them. */
export type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

/**
 * The logger `@WithCorrelation` writes through; `console`, a NestJS `LoggerService` and
 * pino or winston adapters satisfy it.
 */
export interface CorrelationLogger {
  log(message: unknown, ...optionalParams: unknown[]): unknown;
  warn(message: unknown, ...optionalParams: unknown[]): unknown;
  debug?(message: unknown, ...optionalParams: unknown[]): unknown;
  verbose?(message: unknown, ...optionalParams: unknown[]): unknown;
  error?(message: unknown, ...optionalParams: unknown[]): unknown;
  fatal?(message: unknown, ...optionalParams: unknown[]): unknown;
}

/**
 * Resolve a dot-notation path on an object.
 * Returns `undefined` for any missing segment or non-string leaf.
 *
 * @internal
 */
function getByPath(obj: unknown, path: string): string | undefined {
  let current = untyped(obj);
  for (const segment of path.split('.')) {
    if (current == null) return undefined;
    current = untyped(current[segment]);
  }
  return typeof current === 'string' ? (current as string) : undefined;
}

/**
 * Queue-agnostic `MethodDecorator` that propagates a correlation ID into the
 * pipeline's async-local correlation context.
 *
 * Place it **under** any transport or scheduling decorator a framework adds. It does
 * not replace or interfere with them.
 *
 * It extracts the correlation ID from the method arguments (via `path` or
 * `extract`) and runs the method inside {@link runWithCorrelationId}, which
 * keeps the current id, or makes one with `correlationSource.create()`, when
 * no ID is found.
 *
 * **⚠️ Array payloads:**
 * When using the default dot-path extraction, the first argument must be an
 * object (e.g. a Bull `Job`). If it is an array, the dot-path cannot resolve
 * and the decorator logs a warning at runtime. For transports that
 * deliver an array as the first argument, use the `extract` option:
 * ```ts
 * @WithCorrelation({ extract: (items) => items?.[0]?.correlationId })
 * ```
 *
 * Inside the method body, read the active ID with:
 * ```ts
 * import { getCorrelationId } from '@cqrs-ddd/pipeline-correlation';
 * const id = getCorrelationId();
 * ```
 *
 * @example
 * ```ts
 * class Consumers {
 *   // BullMQ job (default path: data.correlationId)
 *   @WithCorrelation()
 *   async sendEmail(job: Job) {
 *     await mailer.send(job.data);
 *   }
 *
 *   // Another key in the job data
 *   @WithCorrelation('data.x-request-id')
 *   async sendSms(job: Job) {}
 *
 *   // RabbitMQ message (amqplib)
 *   @WithCorrelation({ extract: (message) => message.properties.correlationId })
 *   async onUserCreated(message: ConsumeMessage) {}
 *
 *   // Kafka message (kafkajs)
 *   @WithCorrelation({
 *     extract: ({ message }) => message.headers?.['x-correlation-id']?.toString(),
 *   })
 *   async onOrderPlaced(payload: EachMessagePayload) {}
 *
 *   // PostgreSQL LISTEN/NOTIFY
 *   @WithCorrelation({ path: 'correlationId' })
 *   async onNotification(notification: { correlationId?: string }) {}
 *
 *   // Scheduled job: no id in the arguments, so a new one is made
 *   @WithCorrelation()
 *   async hourlySync() {}
 * }
 * ```
 */
export function WithCorrelation(): DualMethodDecorator;
export function WithCorrelation(path: string): DualMethodDecorator;
export function WithCorrelation(
  options: CorrelationDecoratorOptions,
): DualMethodDecorator;
export function WithCorrelation(
  pathOrOptions?: string | CorrelationDecoratorOptions,
): DualMethodDecorator {
  const options: CorrelationDecoratorOptions =
    typeof pathOrOptions === 'string'
      ? { path: pathOrOptions }
      : (pathOrOptions ?? {});

  const { path = 'data.correlationId', extract } = options;

  return methodDecorator((originalMethod, _propertyKey) => {
    return function (this: unknown, ...args: unknown[]) {
      const logger: CorrelationLogger =
        options.logger ??
        (untyped(this)?.logger as CorrelationLogger | undefined) ??
        console;

      if (!extract && Array.isArray(args[0])) {
        logger.warn(
          `${untyped(this).constructor?.name}.${String(_propertyKey)}: first argument is an array — ` +
            `dot-path "${path}" cannot extract a correlation ID from it. ` +
            `Use the 'extract' option for array payloads.`,
        );
      }

      const correlationId = extract
        ? extract(...args)
        : getByPath(args[0], path);

      return runWithCorrelationId(correlationId, () => {
        if (options.logLevel !== 'none') {
          const level = options.logLevel ?? 'debug';
          const method = logger[level as keyof CorrelationLogger];
          if (typeof method === 'function') {
            (method as (msg: string) => void).call(
              logger,
              `🔗 Starting ${untyped(this).constructor?.name}.${String(_propertyKey)} with correlationId: ${getCorrelationId()}`,
            );
          }
        }
        return originalMethod.apply(this, args);
      });
    };
  });
}

/**
 * Pre-built extraction presets for {@link WithCorrelation}, for transports whose
 * handlers receive the correlation id in metadata rather than in the payload.
 *
 * For transports that carry it in the payload (BullMQ, PostgreSQL NOTIFY), use
 * the bare `@WithCorrelation()` or a `path`; for any other shape, an `extract`
 * function.
 *
 * @example
 * ```ts
 * class Users {
 *   // gRPC (@grpc/grpc-js): (request, metadata)
 *   @WithCorrelation(CorrelationFrom.grpc())
 *   async findOne(request: FindOneRequest, metadata: Metadata) {}
 * }
 * ```
 */
export const CorrelationFrom = {
  /**
   * gRPC — extracts from gRPC `Metadata` (second argument).
   *
   * In gRPC handlers the signature is `(data, metadata, call)`.
   *
   * @param key - Metadata key. Defaults to `'x-correlation-id'`.
   */
  grpc: (key = DEFAULT_CORRELATION_HEADER): CorrelationDecoratorOptions => ({
    extract: (_data: unknown, metadata: unknown) => {
      const values = dyn(metadata)?.get?.(key);
      return values?.[0]?.toString();
    },
  }),
} as const;
