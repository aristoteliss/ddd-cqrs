/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Server } from 'node:http';
import type { Express } from 'express';
import { SignJWT } from 'jose';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HEADERS } from '../common/constants/headers.constants.js';
import { httpExchangeStore } from '../common/context/http-exchange.store.js';
import { getSessionPrincipal } from '../common/context/session-principal.store.js';
import { domainAnswer } from '../domain-answer.js';
import { requestContext } from '../http/context.js';
import type { Around } from '../http/dispatch.js';
import { expressApp } from '../http/express.js';
import { fastifyApp } from '../http/fastify.js';
import { route } from '../http/route.js';
import { TenantSchemaMiddleware } from '../persistence/middlewares/tenant-schema.middleware.js';
import { persistenceConfig } from '../persistence/persistence.config.js';
import { TenantSchemaContext } from '../persistence/tenant-schema.context.js';
import { authenticate } from './authenticate.js';
import { ApiClientAuthenticator } from './services/api-client-authenticator.js';
import { JwtAuthenticator } from './services/jwt-authenticator.js';
import { RequestPrincipalResolver } from './services/request-principal-resolver.js';
import { SessionService } from './services/session.service.js';

const jwtSecret = vi.hoisted(() => {
  const secret = 'integration-test-jwt-secret-key-32b!';
  process.env.JWT_SECRET = secret;
  delete process.env.JWT_PUBLIC_KEY;
  process.env.API_CLIENTS = JSON.stringify([
    {
      id: 'trusted-client',
      key: 'client-api-key-999',
      tenant: 'tenant_a',
      rules: ['User|read|*'],
    },
  ]);
  return secret;
});

/** A session read from the `x-test-session-user` header, recording its own deletion. */
function testSession(header: string | string[] | undefined) {
  if (typeof header !== 'string') return undefined;
  const session: Record<string, unknown> = {
    user: JSON.parse(header),
    deleted: false,
    delete: () => {
      session.deleted = true;
      delete session.user;
      delete session.token;
    },
  };
  return session;
}

function mount() {
  const tenants = new TenantSchemaContext();
  const tenant = new TenantSchemaMiddleware(
    tenants,
    new Set(persistenceConfig().tenants),
  );
  const authenticated = authenticate(
    new RequestPrincipalResolver(
      new JwtAuthenticator(),
      new ApiClientAuthenticator(),
      new SessionService(),
    ),
  );
  const around: Around = (request, work) =>
    authenticated(
      {
        ...request,
        session:
          testSession(request.headers['x-test-session-user']) ??
          request.session,
      },
      work,
    );
  const logger = pino({ level: 'silent' });
  return {
    routes: [
      route({
        method: 'GET',
        path: '/test-auth/principal',
        handle: async () => {
          await Promise.resolve();
          return getSessionPrincipal() ?? { anonymous: true };
        },
      }),
      route({
        method: 'GET',
        path: '/test-auth/concurrent',
        handle: async ({ query }) => {
          const delay =
            Number.parseInt(String((query as { delay?: string }).delay), 10) ||
            10;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return { user: getSessionPrincipal(), schema: tenants.schema };
        },
      }),
      route({
        method: 'GET',
        path: '/test-auth/session-status',
        handle: async () => {
          const session = httpExchangeStore.getStore()?.session as
            | { deleted?: boolean }
            | undefined;
          return {
            sessionDeleted: session?.deleted ?? false,
            user: getSessionPrincipal() ?? { anonymous: true },
          };
        },
      }),
    ],
    context: requestContext(logger, [
      (req, res, next) => tenant.use(req, res, next),
    ]),
    logger,
    domain: domainAnswer,
    around,
  };
}

describe.each(['express', 'fastify'] as const)(
  'HTTP authentication on %s',
  (adapter) => {
    let server: Express | Server;
    let close: () => Promise<unknown> = async () => undefined;

    beforeAll(async () => {
      process.env.SQLITE_TENANTS = 'tenant_a,tenant_b';
      const options = mount();
      if (adapter === 'fastify') {
        const fastify = await fastifyApp(options);
        await fastify.ready();
        server = fastify.server;
        close = () => fastify.close();
      } else {
        server = expressApp(options);
      }
    });

    afterAll(() => close());

    it('Valid Bearer JWT -> 200 with principal resolved inside the route', async () => {
      const token = await new SignJWT({
        tenant: 'tenant_a',
        email: 'bearer-user@acme.test',
        roles: ['editor'],
        sid: 'session-bearer-1',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('user-bearer-valid')
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(jwtSecret));

      const res = await request(server)
        .get('/test-auth/principal')
        .set(HEADERS.TENANT_SCHEMA, 'tenant_a')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: 'user-bearer-valid',
        type: 'user',
        tenant: 'tenant_a',
      });
      expect(res.body).not.toHaveProperty('email');
      expect(res.body).not.toHaveProperty('capabilities');
    });

    it('Expired or malformed Bearer JWT -> 401 Unauthorized', async () => {
      const expiredToken = await new SignJWT({
        tenant: 'tenant_a',
        sid: 'session-expired',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('user-expired')
        .setExpirationTime('-1h')
        .sign(new TextEncoder().encode(jwtSecret));

      const res = await request(server)
        .get('/test-auth/principal')
        .set(HEADERS.TENANT_SCHEMA, 'tenant_a')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });

    it('Wrong-tenant Bearer JWT -> 401 Unauthorized', async () => {
      const tokenForTenantB = await new SignJWT({
        tenant: 'tenant_b',
        sid: 'session-tenant-b',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('user-b')
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(jwtSecret));

      const res = await request(server)
        .get('/test-auth/principal')
        .set(HEADERS.TENANT_SCHEMA, 'tenant_a')
        .set('Authorization', `Bearer ${tokenForTenantB}`);

      expect(res.status).toBe(401);
    });

    it('Valid API key -> 200 with principal resolved inside the route', async () => {
      const res = await request(server)
        .get('/test-auth/principal')
        .set(HEADERS.TENANT_SCHEMA, 'tenant_a')
        .set(HEADERS.API_ID, 'trusted-client')
        .set(HEADERS.API_KEY, 'client-api-key-999');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: 'trusted-client',
        tenant: 'tenant_a',
        grants: [{ subject: 'User', action: 'read' }],
      });
    });

    it('Valid API key + wrong tenant -> 401 Unauthorized', async () => {
      const res = await request(server)
        .get('/test-auth/principal')
        .set(HEADERS.TENANT_SCHEMA, 'tenant_b')
        .set(HEADERS.API_ID, 'trusted-client')
        .set(HEADERS.API_KEY, 'client-api-key-999');

      expect(res.status).toBe(401);
    });

    it('Concurrent HTTP requests maintain strict AsyncLocalStorage isolation across async turns in the route', async () => {
      const tokenA = await new SignJWT({
        tenant: 'tenant_a',
        roles: ['admin'],
        sid: 'session-concurrent-a',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('user-concurrent-a')
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(jwtSecret));

      const tokenB = await new SignJWT({
        tenant: 'tenant_b',
        roles: ['guest'],
        sid: 'session-concurrent-b',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('user-concurrent-b')
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(jwtSecret));

      // Request A starts first and delays 25ms, Request B starts second and delays 5ms
      const reqA = request(server)
        .get('/test-auth/concurrent?delay=25')
        .set(HEADERS.TENANT_SCHEMA, 'tenant_a')
        .set('Authorization', `Bearer ${tokenA}`);

      const reqB = request(server)
        .get('/test-auth/concurrent?delay=5')
        .set(HEADERS.TENANT_SCHEMA, 'tenant_b')
        .set('Authorization', `Bearer ${tokenB}`);

      const [resA, resB] = await Promise.all([reqA, reqB]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      expect(resA.body).toEqual({
        user: expect.objectContaining({
          id: 'user-concurrent-a',
          tenant: 'tenant_a',
        }),
        schema: 'tenant_a',
      });

      expect(resB.body).toEqual({
        user: expect.objectContaining({
          id: 'user-concurrent-b',
          tenant: 'tenant_b',
        }),
        schema: 'tenant_b',
      });
    });

    it('Valid session cookie -> 200 with principal resolved inside the route from the session cookie', async () => {
      const sessionUser = {
        id: 'user-cookie-fastpath',
        type: 'user',
        tenant: 'tenant_a',
        email: 'cookie@example.test',
        sid: 'session-cookie-1',
        expiresAt: Date.now() + 60_000,
      };

      const res = await request(server)
        .get('/test-auth/principal')
        .set(HEADERS.TENANT_SCHEMA, 'tenant_a')
        .set('x-test-session-user', JSON.stringify(sessionUser));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: 'user-cookie-fastpath',
        tenant: 'tenant_a',
        email: 'cookie@example.test',
      });
    });

    it('Expired session cookie -> clears session via SessionService and resolves to anonymous', async () => {
      const expiredUser = {
        id: 'user-cookie-expired',
        type: 'user',
        tenant: 'tenant_a',
        email: 'expired@example.test',
        sid: 'session-cookie-expired',
        expiresAt: Date.now() - 5000,
      };

      const res = await request(server)
        .get('/test-auth/session-status')
        .set(HEADERS.TENANT_SCHEMA, 'tenant_a')
        .set('x-test-session-user', JSON.stringify(expiredUser));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        sessionDeleted: true,
        user: { anonymous: true },
      });
    });

    it('Expired session cookie + valid Bearer JWT -> clears expired session and falls through to JWT principal', async () => {
      const expiredUser = {
        id: 'user-cookie-expired',
        type: 'user',
        tenant: 'tenant_a',
        sid: 'session-cookie-expired',
        expiresAt: Date.now() - 5000,
      };

      const token = await new SignJWT({
        tenant: 'tenant_a',
        roles: ['editor'],
        sid: 'session-jwt-fallback',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('user-jwt-fallback')
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(jwtSecret));

      const res = await request(server)
        .get('/test-auth/principal')
        .set(HEADERS.TENANT_SCHEMA, 'tenant_a')
        .set('x-test-session-user', JSON.stringify(expiredUser))
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: 'user-jwt-fallback',
        tenant: 'tenant_a',
      });
    });

    it('Session cookie with tenant mismatch -> 401 Unauthorized', async () => {
      const mismatchedUser = {
        id: 'user-mismatched',
        type: 'user',
        tenant: 'tenant_b',
        sid: 'session-cookie-mismatch',
        expiresAt: Date.now() + 60_000,
      };

      const res = await request(server)
        .get('/test-auth/principal')
        .set(HEADERS.TENANT_SCHEMA, 'tenant_a')
        .set('x-test-session-user', JSON.stringify(mismatchedUser));

      expect(res.status).toBe(401);
    });

    it('Bearer JWT without sid -> 401 Unauthorized', async () => {
      const tokenWithoutSid = await new SignJWT({
        tenant: 'tenant_a',
        roles: ['editor'],
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('user-legacy')
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(jwtSecret));

      const res = await request(server)
        .get('/test-auth/principal')
        .set(HEADERS.TENANT_SCHEMA, 'tenant_a')
        .set('Authorization', `Bearer ${tokenWithoutSid}`);

      expect(res.status).toBe(401);
    });

    it('Session cookie without sid -> clears session and resolves to anonymous', async () => {
      const legacySessionUser = {
        id: 'user-legacy-session',
        type: 'user',
        tenant: 'tenant_a',
        email: 'legacy@example.test',
        expiresAt: Date.now() + 60_000,
      };

      const res = await request(server)
        .get('/test-auth/session-status')
        .set(HEADERS.TENANT_SCHEMA, 'tenant_a')
        .set('x-test-session-user', JSON.stringify(legacySessionUser));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        sessionDeleted: true,
        user: { anonymous: true },
      });
    });

    it('Session cookie without principal type -> clears session and resolves to anonymous', async () => {
      const legacySessionUser = {
        id: 'user-legacy-principal',
        tenant: 'tenant_a',
        email: 'legacy@example.test',
        sid: 'session-legacy-principal',
        expiresAt: Date.now() + 60_000,
      };

      const res = await request(server)
        .get('/test-auth/session-status')
        .set(HEADERS.TENANT_SCHEMA, 'tenant_a')
        .set('x-test-session-user', JSON.stringify(legacySessionUser));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        sessionDeleted: true,
        user: { anonymous: true },
      });
    });
  },
);
