/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { App } from './app.js';
import { logger } from './common/logger.js';
import { domainAnswer } from './domain-answer.js';
import { requestContext } from './http/context.js';
import type { MountOptions } from './http/express.js';
import { TenantSchemaMiddleware } from './persistence/middlewares/tenant-schema.middleware.js';
import { persistenceConfig } from './persistence/persistence.config.js';
import { routes } from './routes.js';

/**
 * What either framework mounts for `app`: the route table, the request context with the
 * tenant of the `x-tenant-schema` header, the error answers and the authentication of
 * every route.
 *
 * @example
 * ```ts
 * expressApp(mountOptions(await createApp())).listen(3000);
 * ```
 */
export function mountOptions(app: App): MountOptions {
  const tenant = new TenantSchemaMiddleware(
    app.tenants,
    new Set(persistenceConfig().tenants),
  );
  return {
    routes: routes(app),
    context: requestContext(logger, [
      (req, res, next) => tenant.use(req, res, next),
    ]),
    logger,
    domain: domainAnswer,
    around: app.around,
  };
}
