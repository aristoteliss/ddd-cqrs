/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  AuditBehavior,
  type AuditRecord,
  type AuditSink,
} from '@cqrs-ddd/pipeline-audit';
import { type Capability, CaslBehavior } from '@cqrs-ddd/pipeline-casl';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { FeatureFlagBehavior } from '@cqrs-ddd/pipeline-feature-flags';
import { RateLimitBehavior } from '@cqrs-ddd/pipeline-rate-limit';
import { ResilienceBehavior } from '@cqrs-ddd/pipeline-resilience';
import { runWithTenant, tenantSource } from '@cqrs-ddd/pipeline-tenant';
import { OpenFeature, TypedInMemoryProvider } from '@openfeature/server-sdk';
import { RateLimiterMemory } from 'rate-limiter-flexible';

/** The caller of the payments service: a merchant and what it may do. */
export interface Merchant {
  readonly id: string;
  readonly rules: readonly Capability[];
}

const merchants = new AsyncLocalStorage<Merchant>();

/**
 * The merchant of the running call. Authorization runs first in every method, so the
 * service only reads it where a merchant is known.
 *
 * @throws Error outside {@link asMerchant}.
 * @example
 * ```ts
 * currentMerchant().id; // 'm-1' inside asMerchant(m1, ...)
 * ```
 */
export function currentMerchant(): Merchant {
  const merchant = merchants.getStore();
  if (!merchant) throw new Error('No merchant is calling.');
  return merchant;
}

/**
 * Runs `work` as `merchant`, inside `tenant`: what an HTTP middleware or a queue
 * consumer does once it has authenticated the caller.
 *
 * @example
 * ```ts
 * await asMerchant({ id: 'm-1', rules }, 'acme', () => payments.history());
 * ```
 */
export function asMerchant<T>(
  merchant: Merchant,
  tenant: string,
  work: () => Promise<T>,
): Promise<T> {
  return runWithTenant(tenant, () => merchants.run(merchant, work));
}

/**
 * The audit sink of the example: it keeps every record in memory, where a real one
 * writes a table or a stream.
 */
export class AuditLedger implements AuditSink {
  readonly records: AuditRecord[] = [];

  write(record: AuditRecord): void {
    this.records.push(record);
  }
}

/** The audit records the payments service writes. */
export const ledger = new AuditLedger();

/** The feature flags of the example; `refunds` starts off. */
export const flags = new TypedInMemoryProvider({
  refunds: {
    disabled: false,
    variants: { on: true, off: false },
    defaultVariant: 'off',
  },
});
await OpenFeature.setProviderAndWait('payments', flags);

/**
 * The one pipeline of the payments service, built once at startup: every behavior
 * instance, and the tenant and correlation id each call takes from where it entered.
 */
export const pipeline = createPipeline({
  behaviors: [
    new CaslBehavior({
      load: async () => {
        const merchant = merchants.getStore();
        return merchant
          ? { principal: { id: merchant.id }, rules: merchant.rules }
          : null;
      },
    }),
    new RateLimitBehavior(new RateLimiterMemory({ points: 3, duration: 60 })),
    new AuditBehavior(ledger),
    new FeatureFlagBehavior(OpenFeature.getClient('payments')),
    new ResilienceBehavior(),
  ],
  sources: { tenantId: tenantSource, correlationId: correlationSource },
});
