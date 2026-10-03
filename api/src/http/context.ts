/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpCorrelationMiddleware } from '@cqrs-ddd/pipeline-correlation';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

/** A Node.js middleware, as Express and the raw request of Fastify take it. */
export type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
) => void;

/**
 * The context every request runs in: its log line, then its correlation id, then the
 * steps given, in order. Each step runs the rest inside its own `AsyncLocalStorage`
 * scope, so the route and every pipeline it starts see them all.
 *
 * @example
 * ```ts
 * const context = requestContext(logger, [tenantStep, principalStep]);
 * ```
 */
export function requestContext(
  logger: Logger,
  steps: readonly Middleware[] = [],
): Middleware {
  const log = pinoHttp({ logger }) as unknown as Middleware;
  const correlation = new HttpCorrelationMiddleware();
  const chain: Middleware[] = [
    log,
    (req, res, next) => correlation.use(req, res, next),
    ...steps,
  ];
  return (req, res, next) => {
    const step = (index: number) => (error?: unknown) => {
      if (error !== undefined) return next(error);
      const current = chain[index];
      if (!current) return next();
      try {
        current(req, res, step(index + 1));
      } catch (thrown) {
        next(thrown);
      }
    };
    step(0)();
  };
}
