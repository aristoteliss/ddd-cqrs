/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { setTenantResolver } from '@cqrs-ddd/core/application';
import { type Cqrs, createCqrs } from '@cqrs-ddd/cqrs';
import { MikroOrmCache } from '@cqrs-ddd/mikro-orm';
import {
  type GlobalBehaviorsOptions,
  logging,
  pinoLogger,
} from '@cqrs-ddd/pipeline';
import { AuditBehavior, LogAuditSink } from '@cqrs-ddd/pipeline-audit';
import {
  buildCache,
  buildCacheAttributes,
  CacheBehavior,
} from '@cqrs-ddd/pipeline-cache';
import { CaslAuthorizer, CaslBehavior } from '@cqrs-ddd/pipeline-casl';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import {
  BullMqDeadLetterTransport,
  buildDeadLetterAttributes,
  DeadLetterBehavior,
} from '@cqrs-ddd/pipeline-deadletter';
import {
  buildFeatureFlagAttributes,
  createFeatureFlagClient,
  FeatureFlagBehavior,
  releaseFeatureFlagProvider,
} from '@cqrs-ddd/pipeline-feature-flags';
import {
  buildIdempotencyAttributes,
  IdempotencyBehavior,
  MemoryIdempotencyStore,
} from '@cqrs-ddd/pipeline-idempotency';
import { registerJobContext } from '@cqrs-ddd/pipeline-job-context';
import {
  AttributesBehavior,
  MetricsBehavior,
  TraceBehavior,
} from '@cqrs-ddd/pipeline-opentelemetry';
import {
  buildRateLimitAttributes,
  RateLimitBehavior,
} from '@cqrs-ddd/pipeline-rate-limit';
import { ResilienceBehavior } from '@cqrs-ddd/pipeline-resilience';
import { currentTenantId, tenantSource } from '@cqrs-ddd/pipeline-tenant';
import { ZodValidationBehavior } from '@cqrs-ddd/pipeline-zod';
import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { Queue, Worker } from 'bullmq';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { CreateAuthHandler } from './auths/application/cqrs/commands/create-auth.handler.js';
import { RevokeAuthHandler } from './auths/application/cqrs/commands/revoke-auth.handler.js';
import { GetUserPermissionRulesHandler } from './auths/application/cqrs/queries/get-user-permission-rules.handler.js';
import type { AuthTokenPolicy } from './auths/application/ports/auth-token-policy.port.js';
import { authenticate } from './auths/authenticate.js';
import { JoseAccessTokenIssuer } from './auths/infrastructure/jose-access-token.issuer.js';
import { NodeRefreshTokens } from './auths/infrastructure/node-refresh-tokens.js';
import { SessionJobPrincipal } from './auths/infrastructure/session-job-principal.js';
import { SharedDemoLoginCodeVerifier } from './auths/infrastructure/shared-demo-login-code.verifier.js';
import { CaslPermissionSource } from './auths/persistence/casl-permission.source.js';
import { CreateAuthCommandRepository } from './auths/persistence/create-auth.command-repository.js';
import { GetAuthByConsumedTokenHashQueryRepository } from './auths/persistence/get-auth-by-consumed-token-hash.query-repository.js';
import { GetAuthByTokenHashQueryRepository } from './auths/persistence/get-auth-by-token-hash.query-repository.js';
import { GetUserPermissionRulesRepository } from './auths/persistence/get-user-permission-rules.query-repository.js';
import { UpdateAuthCommandRepository } from './auths/persistence/update-auth.command-repository.js';
import { ApiClientAuthenticator } from './auths/services/api-client-authenticator.js';
import { JwtAuthenticator } from './auths/services/jwt-authenticator.js';
import { PrincipalLoginService } from './auths/services/principal-login.service.js';
import { RequestPrincipalResolver } from './auths/services/request-principal-resolver.js';
import { SessionService } from './auths/services/session.service.js';
import { AUDIT_DEFAULTS } from './common/audit/audit.options.js';
import { RATE_LIMIT_CAPACITY } from './common/constants/index.js';
import { DEAD_LETTER_DEFAULTS } from './common/dead-letter/dead-letter.options.js';
import {
  PERMISSIONS_IN_ACCESS_TOKEN,
  REFRESH_REUSE_GRACE_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from './common/environment/auth-token.config.js';
import { redisConfig } from './common/environment/redis.config.js';
import { logger } from './common/logger.js';
import type { Around } from './http/dispatch.js';
import { mikroOrmCacheLogger } from './persistence/cache/cache-loggers.js';
import { MikroOrmStore } from './persistence/mikro-orm.store.js';
import { persistenceConfig } from './persistence/persistence.config.js';
import { TenantSchemaContext } from './persistence/tenant-schema.context.js';
import { CreateRoleHandler } from './roles/application/cqrs/commands/create-role.handler.js';
import { DeleteRoleHandler } from './roles/application/cqrs/commands/delete-role.handler.js';
import { UpdateRoleHandler } from './roles/application/cqrs/commands/update-role.handler.js';
import { GetRoleHandler } from './roles/application/cqrs/queries/get-role.handler.js';
import { GetRolesHandler } from './roles/application/cqrs/queries/get-roles.handler.js';
import { CreateRoleCommandRepository } from './roles/persistence/create-role.command-repository.js';
import { DeleteRoleCommandRepository } from './roles/persistence/delete-role.command-repository.js';
import { GetRoleQueryRepository } from './roles/persistence/get-role.query-repository.js';
import { GetRolesQueryRepository } from './roles/persistence/get-roles.query-repository.js';
import { UpdateRoleCommandRepository } from './roles/persistence/update-role.command-repository.js';
import { CreateUserHandler } from './users/application/cqrs/commands/create-user.handler.js';
import { DeleteUserHandler } from './users/application/cqrs/commands/delete-user.handler.js';
import { UpdateUserHandler } from './users/application/cqrs/commands/update-user.handler.js';
import { UserCreatedHandler } from './users/application/cqrs/events/user-created.handler.js';
import { UserUpdatedHandler } from './users/application/cqrs/events/user-updated.handler.js';
import { GetUserHandler } from './users/application/cqrs/queries/get-user.handler.js';
import { GetUserOverviewHandler } from './users/application/cqrs/queries/get-user-overview.handler.js';
import { GetUsersHandler } from './users/application/cqrs/queries/get-users.handler.js';
import {
  BATCH_UPDATE_USERS_QUEUE,
  BatchUpdateUsersProcessor,
} from './users/jobs/batch-update-users.processor.js';
import { BullMqUserEventDispatcher } from './users/jobs/bullmq-user-event-dispatcher.adapter.js';
import {
  SendWelcomeEmailProcessor,
  WELCOME_EMAIL_QUEUE,
} from './users/jobs/send-welcome-email.processor.js';
import { CreateUserCommandRepository } from './users/persistence/create-user.command-repository.js';
import { DeleteUserCommandRepository } from './users/persistence/delete-user.command-repository.js';
import { GetUserQueryRepository } from './users/persistence/get-user.query-repository.js';
import { GetUserCapabilitiesQueryRepository } from './users/persistence/get-user-capabilities.query-repository.js';
import { GetUsersQueryRepository } from './users/persistence/get-users.query-repository.js';
import { UpdateUserCommandRepository } from './users/persistence/update-user.command-repository.js';

const FEATURE_FLAGS = {
  provider: new TypedInMemoryProvider({
    'user-registration': {
      disabled: false,
      variants: { on: true, off: false },
      defaultVariant: 'on',
    },
    'role-creation': {
      disabled: false,
      variants: { on: true, off: false },
      defaultVariant: 'on',
    },
  }),
};

/**
 * The behaviors around every handler: logging, tracing, metrics, the span attributes
 * of the add-ons and the Zod validation of the request; dead letters around commands
 * and events.
 *
 * @example
 * ```ts
 * createCqrs({ behaviors, globalBehaviors: GLOBAL_BEHAVIORS });
 * ```
 */
export const GLOBAL_BEHAVIORS: GlobalBehaviorsOptions[] = [
  {
    scope: 'all',
    before: [
      logging({ requestResponseLogLevel: 'log' }),
      [TraceBehavior, { tracerName: 'users-api' }],
      [MetricsBehavior, { meterName: 'users-api' }],
      [
        AttributesBehavior,
        {
          factories: [
            buildFeatureFlagAttributes,
            buildCacheAttributes,
            buildIdempotencyAttributes,
            buildRateLimitAttributes,
            buildDeadLetterAttributes,
          ],
        },
      ],
      ZodValidationBehavior,
    ],
  },
  { scope: 'commands', before: [DeadLetterBehavior] },
  { scope: 'events', before: [DeadLetterBehavior] },
];

export interface App {
  readonly cqrs: Cqrs;
  readonly tenants: TenantSchemaContext;
  /** Logins and refreshes of sessions, outside the buses for the refresh. */
  readonly logins: PrincipalLoginService;
  /** Authenticates the caller of every route; see `authenticate`. */
  readonly around: Around;
  /**
   * Stops the job workers, waits for running event handlers, then closes the queues,
   * the caches and the database connections.
   */
  close(): Promise<void>;
}

/**
 * Builds the application: the database store, the queues and their workers, the
 * behaviors, the buses and every handler with its repositories.
 *
 * @example
 * ```ts
 * const app = await createApp();
 * expressApp({ routes: routes(app), context, logger });
 * ```
 */
export async function createApp(): Promise<App> {
  setTenantResolver(currentTenantId);
  const tenants = new TenantSchemaContext();
  const store = new MikroOrmStore(tenants, logger);
  await store.open();
  const cache = <T>() =>
    new MikroOrmCache<T>(store, { logger: mikroOrmCacheLogger });

  const redis = redisConfig();
  const connection = { host: redis.host, port: redis.port };
  const welcomeEmails = new Queue(WELCOME_EMAIL_QUEUE, { connection });
  const userBatches = new Queue(BATCH_UPDATE_USERS_QUEUE, { connection });
  const deadLetters = new Queue('dead-letters', { connection });
  const queryCache = buildCache({
    store:
      !redis.isConfigured && process.env.NODE_ENV !== 'production'
        ? { type: 'memory' }
        : { type: 'redis', url: redis.url },
    ttl: 30_000,
  });

  const sessions = new UpdateAuthCommandRepository(cache(), store);
  const permissionRules = new GetUserPermissionRulesRepository(cache(), store);
  const authByTokenHash = new GetAuthByTokenHashQueryRepository(cache(), store);
  const refreshTokens = new NodeRefreshTokens();
  const cookies = new SessionService();
  const policy: AuthTokenPolicy = {
    refreshTokenTtlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    refreshReuseGraceSeconds: REFRESH_REUSE_GRACE_SECONDS,
    embedPermissions: PERMISSIONS_IN_ACCESS_TOKEN,
  };

  const log = pinoLogger(logger);
  const limiter = new RateLimiterMemory(RATE_LIMIT_CAPACITY);
  const cqrs = createCqrs({
    logger: log,
    sources: { tenantId: tenantSource, correlationId: correlationSource },
    behaviors: [
      new CaslBehavior(new CaslPermissionSource(store, permissionRules)),
      new FeatureFlagBehavior(
        await createFeatureFlagClient(FEATURE_FLAGS),
        undefined,
        { environment: process.env.NODE_ENV ?? 'development' },
        log,
      ),
      new RateLimitBehavior(limiter, undefined, log),
      new MetricsBehavior(log),
      new IdempotencyBehavior(new MemoryIdempotencyStore(), undefined, log),
      new CacheBehavior(queryCache, undefined, log),
      new AuditBehavior(new LogAuditSink({ logger: log }), AUDIT_DEFAULTS, log),
      new ResilienceBehavior(undefined, log),
      new DeadLetterBehavior(
        new BullMqDeadLetterTransport(deadLetters),
        DEAD_LETTER_DEFAULTS,
        log,
      ),
    ],
    globalBehaviors: GLOBAL_BEHAVIORS,
  });

  const authorizer = new CaslAuthorizer();
  const { eventBus } = cqrs;
  const user = new GetUserQueryRepository(cache(), store);
  const roles = new GetRolesQueryRepository(store);
  const dispatcher = new BullMqUserEventDispatcher(welcomeEmails, userBatches);
  const logins = new PrincipalLoginService(
    user,
    new SharedDemoLoginCodeVerifier(),
    new JoseAccessTokenIssuer(
      logger.child({ context: JoseAccessTokenIssuer.name }),
    ),
    policy,
    permissionRules,
    authByTokenHash,
    new GetAuthByConsumedTokenHashQueryRepository(cache(), store),
    sessions,
    refreshTokens,
    cookies,
    eventBus,
    limiter,
  );
  cqrs.register(
    new GetRoleHandler(new GetRoleQueryRepository(cache(), store), authorizer),
    new GetRolesHandler(roles, authorizer),
    new CreateRoleHandler(
      new CreateRoleCommandRepository(cache(), store),
      authorizer,
      eventBus,
    ),
    new UpdateRoleHandler(
      new UpdateRoleCommandRepository(cache(), store),
      authorizer,
      eventBus,
    ),
    new DeleteRoleHandler(
      new DeleteRoleCommandRepository(cache(), store),
      authorizer,
      eventBus,
    ),
    new GetUserHandler(user, authorizer),
    new GetUsersHandler(new GetUsersQueryRepository(store), authorizer),
    new GetUserOverviewHandler(
      user,
      new GetUserCapabilitiesQueryRepository(store),
      roles,
      authorizer,
    ),
    new CreateUserHandler(
      new CreateUserCommandRepository(cache(), store),
      authorizer,
      eventBus,
    ),
    new UpdateUserHandler(
      new UpdateUserCommandRepository(cache(), store),
      authorizer,
      eventBus,
    ),
    new DeleteUserHandler(
      new DeleteUserCommandRepository(cache(), store),
      authorizer,
      eventBus,
    ),
    new UserCreatedHandler(dispatcher),
    new UserUpdatedHandler(dispatcher),
    new CreateAuthHandler(
      eventBus,
      logins,
      new CreateAuthCommandRepository(cache(), store),
      refreshTokens,
      policy,
      cookies,
    ),
    new RevokeAuthHandler(
      eventBus,
      authByTokenHash,
      refreshTokens,
      cookies,
      logins,
    ),
    new GetUserPermissionRulesHandler(permissionRules),
  );

  const unregisterJobContext = registerJobContext({
    principal: new SessionJobPrincipal(sessions, user),
    tenants: persistenceConfig().tenants,
    sources: { tenantId: tenantSource, correlationId: correlationSource },
  });
  const welcome = new SendWelcomeEmailProcessor(
    tenants,
    logger.child({ context: SendWelcomeEmailProcessor.name }),
  );
  const batch = new BatchUpdateUsersProcessor(
    tenants,
    logger.child({ context: BatchUpdateUsersProcessor.name }),
  );
  const workers = [
    new Worker(WELCOME_EMAIL_QUEUE, (job) => welcome.process(job), {
      connection,
    }),
    new Worker(BATCH_UPDATE_USERS_QUEUE, (job) => batch.process(job), {
      connection,
    }),
  ];

  const resolver = new RequestPrincipalResolver(
    new JwtAuthenticator(logger.child({ context: JwtAuthenticator.name })),
    new ApiClientAuthenticator(
      logger.child({ context: ApiClientAuthenticator.name }),
    ),
    cookies,
  );

  return {
    cqrs,
    tenants,
    logins,
    around: authenticate(resolver),
    close: async () => {
      await Promise.all(workers.map((worker) => worker.close()));
      await cqrs.close();
      await Promise.all(
        [welcomeEmails, userBatches, deadLetters].map((queue) => queue.close()),
      );
      unregisterJobContext();
      await queryCache.disconnect();
      await releaseFeatureFlagProvider(FEATURE_FLAGS);
      await store.close();
    },
  };
}
