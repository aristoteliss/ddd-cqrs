/* Copyright (C) 2026-present Aristotelis — see repository license. */

import cookieParser from 'cookie-parser';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { TRUST_PROXY } from '../common/environment/auth-token.config.js';
import { type Answer, notFound } from './answer.js';
import { dispatch } from './dispatch.js';
import { failed, type MountOptions } from './mount-options.js';

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

function send(res: Response, { status, body, headers }: Answer): void {
  res.status(status).set(headers ?? {});
  if (body === undefined) res.end();
  else res.json(body);
}
