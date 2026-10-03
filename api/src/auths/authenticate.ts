/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Session } from '@fastify/secure-session';
import { httpExchangeStore } from '../common/context/http-exchange.store.js';
import { sessionPrincipalStore } from '../common/context/session-principal.store.js';
import type { SessionData } from '../common/types/session-principal.js';
import type { Around } from '../http/dispatch.js';
import type { RequestPrincipalResolver } from './services/request-principal-resolver.js';

/**
 * Authenticates the caller of every route before its input is parsed: the principal of
 * the request's credential, or none, runs the route as the session principal, with the
 * request's session and response at hand for the cookies of a login or logout.
 *
 * @throws HttpError 401 for a credential that is invalid, expired or of another tenant.
 *
 * @example
 * ```ts
 * expressApp({ routes, context, logger, around: authenticate(resolver) });
 * ```
 */
export function authenticate(resolver: RequestPrincipalResolver): Around {
  return async (request, work) => {
    const session = request.session as Session<SessionData> | undefined;
    const principal = await resolver.resolvePrincipal({
      headers: request.headers,
      session,
    });
    return sessionPrincipalStore.run(principal, () =>
      httpExchangeStore.run({ session, response: request.response }, work),
    );
  };
}
