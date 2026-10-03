/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { CommandBus } from '@cqrs-ddd/cqrs';
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';
import pino from 'pino';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { getSessionPrincipal } from '../common/context/session-principal.store.js';
import type { SessionPrincipal } from '../common/types/session-principal.js';
import { domainAnswer } from '../domain-answer.js';
import { requestContext } from '../http/context.js';
import { expressApp } from '../http/express.js';
import { fastifyApp } from '../http/fastify.js';
import { HttpError } from '../http/http-error.js';
import { route } from '../http/route.js';
import { CreateAuthCommand } from './application/cqrs/commands/create-auth.command.js';
import { RevokeAuthCommand } from './application/cqrs/commands/revoke-auth.command.js';
import type { AuthResult } from './application/results/auth.result.js';
import { authenticate } from './authenticate.js';
import { InvalidRefreshTokenError } from './domain/errors/refresh-token.errors.js';
import { Auth } from './domain/models/auth.entity.js';
import { authRoutes, sessionBody } from './routes.js';
import type { PrincipalLoginService } from './services/principal-login.service.js';
import type { RequestPrincipalResolver } from './services/request-principal-resolver.js';

const result: AuthResult = {
  aggregate: Auth.create('u-1', 'hash', Date.now() + 60_000),
  userId: 'u-1',
  principalType: 'user',
  tenant: 'tenant_a',
  email: 'ann@example.test',
  accessToken: 'access-token',
  accessTokenExpiresAt: 1_000,
  refreshToken: 'refresh-token',
  sessionExpiresAt: 2_000,
};

const execute = vi.fn();
const refresh = vi.fn();
const resolvePrincipal = vi.fn();
const commandBus = { execute } as unknown as CommandBus;
const logins = { refresh } as unknown as PrincipalLoginService;
const logger = pino({ level: 'silent' });
const options = {
  routes: [
    ...authRoutes(commandBus, logins),
    route({
      method: 'GET',
      path: '/whoami',
      handle: async () => ({ principal: getSessionPrincipal() ?? null }),
    }),
  ],
  context: requestContext(logger, [
    (_req, _res, next) => runWithTenant('tenant_a', next),
  ]),
  logger,
  domain: domainAnswer,
  around: authenticate({
    resolvePrincipal,
  } as unknown as RequestPrincipalResolver),
  sessionSecret: 'a'.repeat(64),
};
const fastify = await fastifyApp(options);

beforeAll(() => fastify.ready());
afterAll(() => fastify.close());

beforeEach(() => {
  execute.mockReset();
  refresh.mockReset();
  resolvePrincipal.mockReset().mockResolvedValue(undefined);
});

describe('sessionBody', () => {
  it('answers the session without the refresh token, an absent department as null', () => {
    expect(sessionBody(result)).toEqual({
      id: 'u-1',
      principalType: 'user',
      tenant: 'tenant_a',
      email: 'ann@example.test',
      department: null,
      accessToken: 'access-token',
      accessTokenExpiresAt: 1_000,
    });
  });
});

describe.each([
  ['Express', () => expressApp(options)],
  ['Fastify', () => fastify.server],
])('the /auths routes on %s', (_name, server) => {
  it('logs in with the caller address and answers 200 with the session', async () => {
    execute.mockResolvedValue(result);

    const response = await request(server())
      .post('/auths/login')
      .send({ email: 'ann@example.test', code: '1234' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(sessionBody(result));
    expect(execute).toHaveBeenCalledExactlyOnceWith(
      expect.any(CreateAuthCommand),
    );
    expect(execute.mock.calls[0][0]).toMatchObject({
      email: 'ann@example.test',
      clientIp: expect.any(String),
    });
  });

  it('answers 400 for a login without a code', async () => {
    const response = await request(server())
      .post('/auths/login')
      .send({ email: 'ann@example.test' });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors).toHaveProperty('code');
  });

  it('refreshes with the refresh cookie', async () => {
    refresh.mockResolvedValue(result);

    const response = await request(server())
      .post('/auths/refresh')
      .set('cookie', 'refresh_token=presented');

    expect(response.status).toBe(200);
    expect(refresh).toHaveBeenCalledWith('presented', expect.any(String));
  });

  it('answers 401 with its code for a refresh without the cookie', async () => {
    const response = await request(server()).post('/auths/refresh');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      statusCode: 401,
      error: 'Unauthorized',
      code: 'refresh_invalid',
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('answers 204 to a logout, also for an unknown refresh cookie', async () => {
    execute.mockRejectedValue(new InvalidRefreshTokenError());

    const response = await request(server())
      .post('/auths/logout')
      .set('cookie', 'refresh_token=unknown');

    expect(response.status).toBe(204);
    expect(execute.mock.calls[0][0]).toBeInstanceOf(RevokeAuthCommand);
    expect(execute.mock.calls[0][0]).toMatchObject({
      refreshToken: 'unknown',
    });
  });

  it('runs a route as the principal of its credential', async () => {
    const principal: SessionPrincipal = {
      id: 'u-1',
      type: 'user',
      tenant: 'tenant_a',
      sid: 's-1',
    };
    resolvePrincipal.mockResolvedValue(principal);

    const response = await request(server())
      .get('/whoami')
      .set('authorization', 'Bearer token');

    expect(response.body).toEqual({ principal });
    expect(resolvePrincipal).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer token' }),
      }),
    );
  });

  it('refuses a bad credential with 401 before the body is parsed', async () => {
    resolvePrincipal.mockRejectedValue(
      new HttpError(401, 'Invalid or expired token'),
    );

    const response = await request(server()).post('/auths/login').send({});

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      statusCode: 401,
      message: 'Invalid or expired token',
      error: 'Unauthorized',
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
