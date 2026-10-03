/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { App } from './app.js';
import { authRoutes } from './auths/routes.js';
import type { Route } from './http/route.js';
import { roleRoutes } from './roles/routes.js';
import { userRoutes } from './users/routes.js';

/**
 * The route table of the application, mounted on Express or Fastify alike.
 *
 * @example
 * ```ts
 * expressApp({ routes: routes(app), context, logger, domain: domainAnswer });
 * ```
 */
export function routes(app: App): readonly Route[] {
  return [
    ...userRoutes(app.cqrs),
    ...roleRoutes(app.cqrs),
    ...authRoutes(app.cqrs.commandBus, app.logins),
  ];
}
