/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** The levels behaviors log at, named as NestJS names them. */
export type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

/**
 * The logger a behavior writes through. `console` satisfies it, and so does a NestJS
 * `LoggerService`; a pino logger does through {@link pinoLogger}. A missing optional
 * method makes that level silent.
 */
export interface PipelineLogger {
  log(message: unknown, ...optionalParams: unknown[]): unknown;
  error(message: unknown, ...optionalParams: unknown[]): unknown;
  warn(message: unknown, ...optionalParams: unknown[]): unknown;
  debug?(message: unknown, ...optionalParams: unknown[]): unknown;
  verbose?(message: unknown, ...optionalParams: unknown[]): unknown;
  fatal?(message: unknown, ...optionalParams: unknown[]): unknown;
}

/** The methods of a pino logger that {@link pinoLogger} calls. */
export interface PinoLike {
  trace(fields: object, message?: string): unknown;
  debug(fields: object, message?: string): unknown;
  info(fields: object, message?: string): unknown;
  warn(fields: object, message?: string): unknown;
  error(fields: object, message?: string): unknown;
  fatal(fields: object, message?: string): unknown;
}

const PINO_LEVEL = {
  log: 'info',
  error: 'error',
  warn: 'warn',
  debug: 'debug',
  verbose: 'trace',
  fatal: 'fatal',
} as const;

/**
 * Adapts a pino logger to {@link PipelineLogger}, so behaviors write structured records:
 * `log` writes at pino's `info` and `verbose` at `trace`; the last string argument of a
 * call with more than one is the `context` field, as NestJS passes it; on `error`, a string
 * before it is the `stack` field; an `Error` message becomes `err`; an object message, such
 * as `LoggingBehavior`'s `logFormat: 'structured'` records, becomes the record's fields;
 * other arguments go to `params`.
 *
 * @example
 * ```ts
 * import pino from 'pino';
 *
 * const logger = pinoLogger(pino());
 * const pipeline = createPipeline({
 *   logger,
 *   globalBehaviors: { before: [logging({ logFormat: 'structured' })] },
 * });
 * ```
 */
export function pinoLogger(pino: PinoLike): Required<PipelineLogger> {
  const write =
    (level: LogLevel) =>
    (message: unknown, ...params: unknown[]): void => {
      const last = params.at(-1);
      const context =
        params.length > 0 && typeof last === 'string' ? last : undefined;
      const rest = context === undefined ? params : params.slice(0, -1);
      const stack =
        level === 'error' && typeof rest[0] === 'string'
          ? rest.shift()
          : undefined;
      const fields: Record<string, unknown> = {};
      if (context !== undefined) fields.context = context;
      if (stack !== undefined) fields.stack = stack;
      if (rest.length > 0) fields.params = rest;
      const target = PINO_LEVEL[level];
      if (message instanceof Error) {
        pino[target]({ ...fields, err: message }, message.message);
      } else if (typeof message === 'object' && message !== null) {
        pino[target]({ ...fields, ...message });
      } else {
        pino[target](fields, String(message));
      }
    };
  return {
    log: write('log'),
    error: write('error'),
    warn: write('warn'),
    debug: write('debug'),
    verbose: write('verbose'),
    fatal: write('fatal'),
  };
}
