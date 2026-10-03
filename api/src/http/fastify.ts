/* Copyright (C) 2026-present Aristotelis — see repository license. */

import secureSession from '@fastify/secure-session';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { TRUST_PROXY } from '../common/environment/auth-token.config.js';
import { type Answer, notFound } from './answer.js';
import { dispatch } from './dispatch.js';
import { failed, type MountOptions } from './express.js';

/** Options of {@link fastifyApp}: the mount options and the session cookie's key. */
export interface FastifyOptions extends MountOptions {
  /** The hex key of the encrypted `session` cookie; without it, no session is set up. */
  readonly sessionSecret?: string;
}

/**
 * The Fastify application of the API: the encrypted session cookie, the request context
 * before each handler, every route, then the 404 and error answers.
 *
 * @throws Error when `TRUST_PROXY` is a hop count, which Fastify does not support.
 * @example
 * ```ts
 * const app = await fastifyApp({ routes, context: requestContext(logger), logger, sessionSecret });
 * await app.listen({ port: 3000, host: '0.0.0.0' });
 * ```
 */
export async function fastifyApp(
  options: FastifyOptions,
): Promise<FastifyInstance> {
  if (typeof TRUST_PROXY === 'number') {
    throw new Error(
      `TRUST_PROXY=${TRUST_PROXY} is a hop count, which Fastify does not support; use "true" or an address list such as "loopback, 10.0.0.0/8".`,
    );
  }
  const app = Fastify(
    TRUST_PROXY === undefined ? {} : { trustProxy: TRUST_PROXY },
  );
  if (options.sessionSecret) {
    await app.register(secureSession, {
      key: Buffer.from(options.sessionSecret, 'hex'),
      cookieName: 'session',
      cookie: {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
      },
    });
  }
  app.addHook('preHandler', (req, reply, done) =>
    options.context(req.raw, reply.raw, done as (error?: unknown) => void),
  );
  for (const route of options.routes) {
    app.route({
      method: route.method,
      url: route.path,
      handler: async (req, reply) => {
        const result = await dispatch(
          route,
          {
            params: req.params,
            query: req.query,
            body: req.body,
            headers: req.headers,
            ip: req.ip,
            cookies: (req as { cookies?: Record<string, string | undefined> })
              .cookies,
            session: (req as { session?: unknown }).session,
            response: reply,
          },
          options.around,
        ).catch((error: unknown) => failed(error, options));
        return send(reply, result);
      },
    });
  }
  app.setNotFoundHandler((req, reply) =>
    send(reply, notFound(req.method, req.url)),
  );
  app.setErrorHandler((error, _req, reply) =>
    send(reply, failed(error, options)),
  );
  return app;
}

function send(reply: FastifyReply, { status, body, headers }: Answer) {
  reply.code(status).headers(headers ?? {});
  return body === undefined ? reply.send() : reply.send(body);
}
