/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { CommandBus } from '@cqrs-ddd/cqrs';
import { z } from 'zod';
import { type Route, route } from '../http/route.js';
import { CreateAuthCommand } from './application/cqrs/commands/create-auth.command.js';
import { RevokeAuthCommand } from './application/cqrs/commands/revoke-auth.command.js';
import type { AuthResult } from './application/results/auth.result.js';
import { InvalidRefreshTokenError } from './domain/errors/refresh-token.errors.js';
import { LoginDtoSchema } from './dtos/login.dto.js';
import { RefreshTokenDtoSchema } from './dtos/refresh-token.dto.js';
import type { PrincipalLoginService } from './services/principal-login.service.js';
import { REFRESH_COOKIE } from './services/session.service.js';

/**
 * The answer body of a login or refresh: the session and its short-lived access token,
 * never the refresh token, which travels only in its cookie.
 *
 * @example
 * ```ts
 * sessionBody(result); // { id, principalType, tenant, email, department, accessToken, accessTokenExpiresAt }
 * ```
 */
export function sessionBody(result: AuthResult) {
  return {
    id: result.userId,
    principalType: result.principalType,
    tenant: result.tenant,
    email: result.email,
    department: result.department ?? null,
    accessToken: result.accessToken,
    accessTokenExpiresAt: result.accessTokenExpiresAt,
  };
}

const SessionBody = z.object({
  id: z.string(),
  principalType: z.enum(['user', 'service']),
  tenant: z.string(),
  email: z.string(),
  department: z.string().nullable(),
  accessToken: z.string(),
  accessTokenExpiresAt: z.number(),
});

function refreshToken(
  cookies: Readonly<Record<string, string | undefined>>,
): string {
  const parsed = RefreshTokenDtoSchema.safeParse(cookies[REFRESH_COOKIE]);
  if (!parsed.success) throw new InvalidRefreshTokenError();
  return parsed.data;
}

/**
 * The `/auths` routes. Login starts a session: the access token in the body, the refresh
 * token in an `HttpOnly` cookie. Refresh exchanges that cookie for a new access token.
 * Logout revokes the session of the cookie and clears the cookies, answering 204 also
 * for an unknown or missing cookie.
 *
 * @example
 * ```ts
 * expressApp({ routes: authRoutes(cqrs.commandBus, logins), context, logger });
 * ```
 */
export function authRoutes(
  commandBus: CommandBus,
  logins: PrincipalLoginService,
): Route[] {
  return [
    route({
      method: 'POST',
      path: '/auths/login',
      body: LoginDtoSchema,
      status: 200,
      anonymous: true,
      summary:
        'Starts a session: the access token in the body, the refresh token in an HttpOnly cookie.',
      response: SessionBody,
      handle: async ({ body, ip }) =>
        sessionBody(
          await commandBus.execute<CreateAuthCommand, AuthResult>(
            new CreateAuthCommand({ ...body, clientIp: ip }),
          ),
        ),
    }),
    route({
      method: 'POST',
      path: '/auths/refresh',
      status: 200,
      anonymous: true,
      summary:
        'Exchanges the refresh cookie for a new access token; a rotation sets a new cookie.',
      response: SessionBody,
      handle: async ({ cookies, ip }) =>
        sessionBody(await logins.refresh(refreshToken(cookies), ip)),
    }),
    route({
      method: 'POST',
      path: '/auths/logout',
      status: 204,
      anonymous: true,
      summary:
        'Revokes the session of the refresh cookie and clears the cookies, also for an unknown one.',
      handle: async ({ cookies, ip }) => {
        try {
          await commandBus.execute(
            new RevokeAuthCommand({
              refreshToken: cookies[REFRESH_COOKIE] || undefined,
              clientIp: ip,
            }),
          );
        } catch (error) {
          if (!(error instanceof InvalidRefreshTokenError)) throw error;
        }
      },
    }),
  ];
}
