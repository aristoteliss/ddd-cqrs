/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ICache } from '@cqrs-ddd/core/application';
import { parseCapabilityString } from '@cqrs-ddd/pipeline-casl';
import {
  RedisContainer,
  type StartedRedisContainer,
} from '@testcontainers/redis';
import { Queue } from 'bullmq';
import type { Express } from 'express';
import { SignJWT } from 'jose';
import type { App } from '../../src/app.js';
import type { Around } from '../../src/http/dispatch.js';
import type { MikroOrmStore } from '../../src/persistence/mikro-orm.store.js';

export const E2E_LOGIN_CODE = '424242';

const E2E_SESSION_SECRET = 'a'.repeat(64);

export const E2E_JWT_SECRET = 'e2e-jwt-secret-please-do-not-use-in-prod';

export const E2E_API_CLIENTS = [
  {
    id: 'api-admin-client',
    name: 'Admin Client',
    key: 'admin-secret-key-12345',
    tenants: ['tenant', 'tenant_a', 'tenant_b'],
    rules: ['all|manage|*'],
  },
  {
    id: 'api-read-only-client',
    name: 'Read Only Client',
    key: 'readonly-secret-key-12345',
    tenants: ['tenant', 'tenant_a', 'tenant_b'],
    rules: ['User|read|*', 'Role|read|*'],
  },
  {
    id: 'api-tenant-b-only-client',
    name: 'Tenant B Only Client',
    key: 'tenant-b-secret-key-12345',
    tenants: ['tenant_b'],
    rules: ['User|read|*'],
  },
];

export interface E2EOptions {
  tenants?: string[];
  /** HTTP framework to mount; Express by default. */
  adapter?: 'express' | 'fastify';
  /** `TRUST_PROXY` for this application; unset by default. */
  trustProxy?: string;
  /** `PERMISSIONS_IN_ACCESS_TOKEN` for this application; off by default. */
  permissionsInAccessToken?: boolean;
  /** `ACCESS_TOKEN_MAX_BYTES` for this application; the default otherwise. */
  accessTokenMaxBytes?: number;
  apiClients?: typeof E2E_API_CLIENTS;
}

export interface E2EContext {
  /** The application, for its buses and tenant context. */
  app: App;
  /** What supertest drives: the Express app or the Fastify server. */
  server: Express | Server;
  /**
   * A store and repository caches of its own on the application's databases, for
   * reading and changing the rows and cache entries the application uses. Use it
   * inside a tenant, such as `inTenant(app, …)`. `queue(name)` opens a BullMQ queue of
   * the application's Redis, closed with the context.
   */
  storage: {
    store: MikroOrmStore;
    cache<T>(): ICache<T>;
    queue(name: string): Queue;
  };
  close: () => Promise<void>;
}

/** A Bearer token signed with the e2e secret, for the claims given. */
export async function createTestJwt(options?: {
  sub?: string;
  email?: string;
  department?: string;
  tenant?: string;
  secret?: string;
  expiresIn?: string | number;
  sid?: string;
}): Promise<string> {
  const secret = new TextEncoder().encode(options?.secret ?? E2E_JWT_SECRET);
  const jwt = new SignJWT({
    tenant: options?.tenant ?? 'tenant',
    email: options?.email ?? 'jwt-user@acme.test',
    department: options?.department ?? 'engineering',
    sid: options?.sid ?? 'e2e-test-session-id',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(options?.sub ?? 'jwt-user-1')
    .setIssuedAt();

  jwt.setExpirationTime(options?.expiresIn ?? '2h');

  return await jwt.sign(secret);
}

/**
 * Boots the real application against throwaway libSQL databases, one per tenant, and a
 * Redis container, and mounts it as `bootstrap` does. A request carrying `x-test-user`
 * (a principal as JSON) or `x-test-token` authenticates through a test session, so it
 * still runs the real authentication and authorization.
 */
export async function bootstrapE2E(options?: E2EOptions): Promise<E2EContext> {
  const redis: StartedRedisContainer = await new RedisContainer(
    'redis:7-alpine',
  ).start();

  const dir = mkdtempSync(join(tmpdir(), 'api-e2e-'));

  process.env.NODE_ENV = 'production';
  process.env.REDIS_HOST = redis.getHost();
  process.env.REDIS_PORT = String(redis.getMappedPort(6379));
  process.env.DB_ENGINE = 'libsql';
  delete process.env.DATABASE_URL;
  const tenantList = options?.tenants ?? ['tenant', 'tenant_a', 'tenant_b'];
  process.env.DB_DEFAULT_SCHEMA = tenantList[0] ?? 'tenant';
  process.env.SQLITE_TENANTS = tenantList.join(',');
  process.env.SQLITE_DATABASE_TEMPLATE = `file:${join(dir, '{tenant}.db')}`;

  delete process.env.AUTH_LOGIN_CODE;
  process.env.AUTH_SHARED_LOGIN_CODE = 'true';
  process.env.AUTH_LOGIN_CODE_SHA256 = createHash('sha256')
    .update(E2E_LOGIN_CODE, 'utf8')
    .digest('hex');
  process.env.JWT_SECRET = E2E_JWT_SECRET;
  if (options?.trustProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = options.trustProxy;
  process.env.PERMISSIONS_IN_ACCESS_TOKEN = options?.permissionsInAccessToken
    ? 'true'
    : 'false';
  if (options?.accessTokenMaxBytes === undefined) {
    delete process.env.ACCESS_TOKEN_MAX_BYTES;
  } else {
    process.env.ACCESS_TOKEN_MAX_BYTES = String(options.accessTokenMaxBytes);
  }
  process.env.API_CLIENTS = JSON.stringify(
    options?.apiClients ?? E2E_API_CLIENTS,
  );

  const { migrate } = await import('../../src/persistence/migrate.js');
  await migrate();
  const { verifyUserPermissions } = await import(
    '../../src/persistence/verify-user-permissions.js'
  );
  for (const [tenant, drifted] of await verifyUserPermissions()) {
    if (drifted.length > 0) {
      throw new Error(
        `Permission rules drifted after seeding in ${tenant}: ${drifted.join(', ')}`,
      );
    }
  }

  const { createApp } = await import('../../src/app.js');
  const { MikroOrmCache } = await import('@cqrs-ddd/mikro-orm');
  const { MikroOrmStore } = await import(
    '../../src/persistence/mikro-orm.store.js'
  );
  const { TenantSchemaContext } = await import(
    '../../src/persistence/tenant-schema.context.js'
  );
  const { mountOptions } = await import('../../src/mount.js');
  const app = await createApp();
  const store = new MikroOrmStore(new TenantSchemaContext());
  await store.open();
  const queues: Queue[] = [];
  const connection = { host: redis.getHost(), port: redis.getMappedPort(6379) };
  const storage = {
    store,
    cache: <T>(): ICache<T> => new MikroOrmCache<T>(store),
    queue: (name: string) => {
      const queue = new Queue(name, { connection });
      queues.push(queue);
      return queue;
    },
  };
  const mounted = mountOptions(app);
  const around: Around = mounted.around ?? ((_request, work) => work());
  const options$ = {
    ...mounted,
    around: ((request, work) =>
      around(
        usesTestSession(request.headers)
          ? { ...request, session: testSession(request.headers) }
          : request,
        work,
      )) satisfies Around,
  };

  let server: Express | Server;
  let stop: () => Promise<unknown>;
  if (options?.adapter === 'fastify') {
    const { fastifyApp } = await import('../../src/http/fastify.js');
    const fastify = await fastifyApp({
      ...options$,
      sessionSecret: E2E_SESSION_SECRET,
    });
    await fastify.ready();
    server = fastify.server;
    stop = () => fastify.close();
  } else {
    const { expressApp } = await import('../../src/http/express.js');
    server = expressApp(options$);
    stop = async () => undefined;
  }

  const close = async (): Promise<void> => {
    // Event handlers enqueue BullMQ jobs after the response; let them reach Redis
    // before the shutdown closes the connections underneath them.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await stop();
    await app.close();
    await Promise.all(queues.map((queue) => queue.close()));
    await store.close();
    await redis.stop();
    rmSync(dir, { recursive: true, force: true });
  };

  return { app, server, storage, close };
}

function usesTestSession(
  headers: Record<string, string | string[] | undefined>,
): boolean {
  return (
    headers['x-test-user'] !== undefined ||
    headers['x-test-token'] !== undefined
  );
}

function testSession(
  headers: Record<string, string | string[] | undefined>,
): unknown {
  const raw = headers['x-test-user'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  const parsedUser = header ? JSON.parse(header) : undefined;
  const rawTenant = headers['x-tenant-schema'];
  const tenant = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant;
  const type =
    parsedUser?.type ??
    parsedUser?.principalType ??
    (parsedUser?.grants ? 'service' : 'user');
  const user = parsedUser
    ? {
        ...parsedUser,
        sid: parsedUser.sid ?? 'e2e-session-id',
        expiresAt: parsedUser.expiresAt ?? Date.now() + 3_600_000,
        tenant: parsedUser.tenant ?? tenant,
        type,
        principalType: type,
        ...(parsedUser.grants
          ? { grants: parsedUser.grants.map(parseCapabilityString) }
          : {}),
      }
    : undefined;
  const rawToken = headers['x-test-token'];
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const store: Record<string, unknown> = {
    ...(user ? { user } : {}),
    ...(token ? { token } : {}),
  };
  const session = {
    get: (key: string) => store[key],
    set: (key: string, value: unknown) => {
      store[key] = value;
    },
    delete: () => {
      for (const key of Object.keys(store)) delete store[key];
    },
  };
  return new Proxy(session, {
    get(target, prop: string) {
      return prop in target ? Reflect.get(target, prop) : store[prop];
    },
    set(target, prop: string, value: unknown) {
      if (prop in target) Reflect.set(target, prop, value);
      else store[prop] = value;
      return true;
    },
  });
}

/** Rebuilds the materialized permission rules of every user in every tenant. */
export async function rebuildPermissions(): Promise<void> {
  const { rebuildUserPermissions } = await import(
    '../../src/persistence/rebuild-user-permissions.js'
  );
  await rebuildUserPermissions();
}

/** Runs raw SQL in the database of `tenant`, outside the application's store. */
export async function execute(
  sql: string,
  params: unknown[] = [],
  tenant = 'tenant',
): Promise<unknown> {
  const { forEachTenantOrm } = await import(
    '../../src/persistence/tenant-orms.js'
  );
  const results = await forEachTenantOrm(async (orm, name) =>
    name === tenant ? orm.em.getConnection().execute(sql, params) : undefined,
  );
  return results.get(tenant);
}

/** Runs `work` in `tenant`, as a request of that tenant would. */
export function inTenant<T>(
  app: App,
  work: () => T | Promise<T>,
  tenant = 'tenant',
): Promise<T> {
  return Promise.resolve(app.tenants.run(tenant, work));
}

/** The HTTP frameworks every end-to-end suite runs on. */
export const ADAPTERS = ['express', 'fastify'] as const;
