/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createCqrs } from '@cqrs-ddd/cqrs';
import { AuditBehavior, type AuditRecord } from '@cqrs-ddd/pipeline-audit';
import { buildCache, CacheBehavior } from '@cqrs-ddd/pipeline-cache';
import { CaslBehavior, parseCapabilityString } from '@cqrs-ddd/pipeline-casl';
import {
  DeadLetterBehavior,
  type DeadLetterRecord,
} from '@cqrs-ddd/pipeline-deadletter';
import {
  createFeatureFlagClient,
  FeatureFlagBehavior,
} from '@cqrs-ddd/pipeline-feature-flags';
import {
  IdempotencyBehavior,
  MemoryIdempotencyStore,
} from '@cqrs-ddd/pipeline-idempotency';
import { RateLimitBehavior } from '@cqrs-ddd/pipeline-rate-limit';
import { ResilienceBehavior } from '@cqrs-ddd/pipeline-resilience';
import { runWithTenant, tenantSource } from '@cqrs-ddd/pipeline-tenant';
import { ZodValidationBehavior } from '@cqrs-ddd/pipeline-zod';
import { InMemoryProvider } from '@openfeature/server-sdk';
import pino from 'pino';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { CaslPermissionSource } from '../../src/auths/persistence/casl-permission.source.js';
import { sessionPrincipalStore } from '../../src/common/context/session-principal.store.js';
import { DEAD_LETTER_DEFAULTS } from '../../src/common/dead-letter/dead-letter.options.js';
import { domainAnswer } from '../../src/domain-answer.js';
import { requestContext } from '../../src/http/context.js';
import type { Route } from '../../src/http/route.js';

const silent = { log() {}, warn() {}, error() {} };

/** The id of the caller that `mountOptions` sets as the session principal. */
export const CALLER_ID = '01999a7e-6b5e-7cc4-9a43-3e1f6c2b9d10';

/**
 * The buses with the application's behaviors over in-memory stores, recording audit
 * records and dead letters. `domain` names the feature-flag client, one per spec file.
 * The CASL rules are the grants of the session principal, so the permission source
 * reads no database.
 */
export async function memoryCqrs(domain: string) {
  const audits: AuditRecord[] = [];
  const deadLetters: DeadLetterRecord[] = [];
  const on = { disabled: false, variants: { on: true }, defaultVariant: 'on' };
  const cqrs = createCqrs({
    logger: silent,
    bootstrapLogLevel: 'none',
    sources: { tenantId: tenantSource },
    behaviors: [
      new CaslBehavior(
        new CaslPermissionSource(undefined as never, undefined as never),
      ),
      new FeatureFlagBehavior(
        await createFeatureFlagClient({
          provider: new InMemoryProvider({
            'user-registration': on,
            'role-creation': on,
          }),
          domain,
        }),
      ),
      new RateLimitBehavior(
        new RateLimiterMemory({ points: 60, duration: 60 }),
      ),
      new IdempotencyBehavior(new MemoryIdempotencyStore()),
      new CacheBehavior(buildCache({ store: { type: 'memory' }, ttl: 30_000 })),
      new AuditBehavior({ write: (record) => void audits.push(record) }),
      new ResilienceBehavior(),
      new DeadLetterBehavior(
        { send: async (record) => void deadLetters.push(record) },
        DEAD_LETTER_DEFAULTS,
        silent,
      ),
    ],
    globalBehaviors: [
      { scope: 'all', before: [ZodValidationBehavior] },
      { scope: 'commands', before: [DeadLetterBehavior] },
      { scope: 'events', before: [DeadLetterBehavior] },
    ],
  });
  return { cqrs, audits, deadLetters };
}

/**
 * Mount options for `routes` in tenant `tenant_a`, with a session principal holding the
 * grants `grants()` returns at each request, or none when it returns `undefined`.
 */
export function mountOptions(
  routes: Route[],
  grants: () => readonly string[] | undefined,
) {
  const logger = pino({ level: 'silent' });
  return {
    routes,
    context: requestContext(logger, [
      (_req, _res, next) => {
        const held = grants();
        runWithTenant('tenant_a', () =>
          sessionPrincipalStore.run(
            held && {
              id: CALLER_ID,
              type: 'user',
              tenant: 'tenant_a',
              grants: held.map(parseCapabilityString),
            },
            next,
          ),
        );
      },
    ]),
    logger,
    domain: domainAnswer,
  };
}
