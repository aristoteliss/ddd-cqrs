/* Copyright (C) 2026-present Aristotelis — see repository license. */

import cookieParser from 'cookie-parser';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import type { Logger } from 'pino';
import { TRUST_PROXY } from '../common/environment/auth-token.config.js';
import { type Answer, answer, type DomainAnswer, notFound } from './answer.js';
import type { Middleware } from './context.js';
import { type Around, dispatch } from './dispatch.js';
import type { Route } from './route.js';

/** What both mounts take: the routes, the request context and the error mapping. */
export interface MountOptions {
  readonly routes: readonly Route[];
  readonly context: Middleware;
  readonly logger: Logger;
  readonly domain?: DomainAnswer;
  /** Runs around every route, such as the authentication of its caller. */
  readonly around?: Around;
}

/**
 * The Express application of the API: JSON bodies, cookies, the request context, every
 * route, then the 404 and error answers.
 *
 * @example
 * ```ts
 * expressApp({ routes, context: requestContext(logger), logger }).listen(3000);
 * ```
 */
export function expressApp(options: MountOptions): Express {
  const app = express();
  if (TRUST_PROXY !== undefined) app.set('trust proxy', TRUST_PROXY);
  app.use(express.json());
  app.use(cookieParser());
  app.use(options.context as express.RequestHandler);
  for (const route of options.routes) {
    const method = route.method.toLowerCase() as
      | 'get'
      | 'post'
      | 'patch'
      | 'delete';
    app[method](route.path, async (req: Request, res: Response) => {
      const result = await dispatch(
        route,
        {
          params: req.params,
          query: req.query,
          body: req.body,
          headers: req.headers,
          ip: req.ip ?? '',
          cookies: req.cookies,
          response: res,
        },
        options.around,
      ).catch((error: unknown) => failed(error, options));
      send(res, result);
    });
  }
  app.use((req: Request, res: Response) =>
    send(res, notFound(req.method, req.originalUrl)),
  );
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) =>
    send(res, failed(error, options)),
  );
  return app;
}

/** The answer for an error, logging the ones that answer 500. */
export function failed(
  error: unknown,
  options: Pick<MountOptions, 'domain' | 'logger'>,
): Answer {
  const result = answer(error, options.domain);
  if (result.status >= 500)
    options.logger.error({ err: error }, 'request failed');
  return result;
}

function send(res: Response, { status, body, headers }: Answer): void {
  res.status(status).set(headers ?? {});
  if (body === undefined) res.end();
  else res.json(body);
}
