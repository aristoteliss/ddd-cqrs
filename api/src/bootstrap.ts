/* Copyright (C) 2026-present Aristotelis — see repository license. */

import './tracing.js';
import { createApp } from './app.js';
import { logger } from './common/logger.js';
import { type Closable, closeOnShutdownSignals } from './graceful-shutdown.js';
import { expressApp } from './http/express.js';
import { fastifyApp } from './http/fastify.js';
import { mountOptions } from './mount.js';
import { shutdownTracing } from './tracing.js';

const PORT = 3000;
const HOST = '0.0.0.0';

/** Starts the application, then serves it with Express, or Fastify with `ADAPTER=fastify`. */
export async function bootstrap(): Promise<void> {
  const useFastify = process.env.ADAPTER === 'fastify';
  const app = await createApp();
  const options = mountOptions(app);

  let server: Closable;
  if (useFastify) {
    if (!process.env.SESSION_SECRET) {
      throw new Error('SESSION_SECRET must be set for secure sessions');
    }
    const fastify = await fastifyApp({
      ...options,
      sessionSecret: process.env.SESSION_SECRET,
    });
    await fastify.listen({ port: PORT, host: HOST });
    server = fastify;
  } else {
    const http = expressApp(options).listen(PORT, HOST);
    await new Promise((resolve) => http.once('listening', resolve));
    server = {
      close: () =>
        new Promise((resolve) => http.close(() => resolve(undefined))),
    };
  }
  closeOnShutdownSignals([server, app, { close: shutdownTracing }]);
  logger.info(
    `Users API running on http://localhost:${PORT} (adapter: ${useFastify ? 'fastify' : 'express'})`,
  );
}
