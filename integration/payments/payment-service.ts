/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { audit } from '@cqrs-ddd/pipeline-audit';
import { requires } from '@cqrs-ddd/pipeline-casl';
import { getCorrelationId } from '@cqrs-ddd/pipeline-correlation';
import { featureFlag } from '@cqrs-ddd/pipeline-feature-flags';
import {
  createPartitionedRateLimitKeyFactory,
  rateLimit,
} from '@cqrs-ddd/pipeline-rate-limit';
import { resilience } from '@cqrs-ddd/pipeline-resilience';
import { currentTenantId } from '@cqrs-ddd/pipeline-tenant';
import { validated } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';
import { currentMerchant, pipeline } from './composition.js';

/** A gateway failure worth retrying: the charge did not reach the card network. */
export class GatewayTimeoutError extends Error {}

/** The card network, behind the service. */
export interface PaymentGateway {
  capture(amount: number, currency: string): Promise<string>;
}

/** A payment as the service keeps it. */
export interface Payment {
  readonly id: string;
  readonly merchantId: string;
  readonly tenantId: string | undefined;
  readonly amount: number;
  readonly currency: 'EUR' | 'USD';
  readonly reference: string;
  readonly correlationId: string;
  status: 'captured' | 'refunded';
}

const Charge = z.object({
  paymentId: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.enum(['EUR', 'USD']),
});

const perMerchant = createPartitionedRateLimitKeyFactory(
  () => currentMerchant().id,
);
const actor = () => ({ id: currentMerchant().id });

/**
 * Payments on the pipeline alone: no buses, no aggregates. Each method declares its
 * behaviors, outermost first, and runs only after every one of them let it through.
 *
 * - `charge()` checks the merchant may create payments, limits each merchant to three
 *   calls a minute, audits the attempt, retries a gateway timeout twice and receives
 *   its input parsed by Zod.
 * - `refund()` runs only while the `refunds` flag is on.
 * - `history()` lists the merchant's payments in the current tenant.
 *
 * @example
 * ```ts
 * const payments = new PaymentService(gateway);
 * await asMerchant(merchant, 'acme', () =>
 *   payments.charge({ paymentId: 'p-1', amount: 1200, currency: 'EUR' }),
 * );
 * ```
 */
export class PaymentService {
  readonly #payments = new Map<string, Payment>();

  constructor(private readonly gateway: PaymentGateway) {}

  @pipeline.wrap(
    { kind: 'command' },
    requires({ action: 'create', subject: 'Payment' }),
    rateLimit({ keyFactory: perMerchant }),
    audit({ action: 'payment.charge', actor }),
    validated(Charge),
    resilience({
      handle: (error) => error instanceof GatewayTimeoutError,
      retry: {
        maxAttempts: 2,
        replaySafe: true,
        backoff: { type: 'constant', delay: 0 },
      },
    }),
  )
  async charge(input: z.input<typeof Charge>): Promise<Payment> {
    const { paymentId, amount, currency } = input as z.output<typeof Charge>;
    const payment: Payment = {
      id: paymentId,
      merchantId: currentMerchant().id,
      tenantId: currentTenantId(),
      amount,
      currency,
      reference: await this.gateway.capture(amount, currency),
      correlationId: getCorrelationId(),
      status: 'captured',
    };
    this.#payments.set(paymentId, payment);
    return payment;
  }

  @pipeline.wrap(
    { kind: 'command' },
    featureFlag({ flag: 'refunds' }),
    requires({ action: 'refund', subject: 'Payment' }),
    audit({ action: 'payment.refund', actor }),
  )
  async refund(paymentId: string): Promise<Payment | undefined> {
    const payment = this.#payments.get(paymentId);
    if (payment) payment.status = 'refunded';
    return payment;
  }

  @pipeline.wrap(
    { kind: 'query' },
    requires({ action: 'read', subject: 'Payment' }),
  )
  async history(): Promise<Payment[]> {
    const merchantId = currentMerchant().id;
    const tenantId = currentTenantId();
    return [...this.#payments.values()].filter(
      (payment) =>
        payment.merchantId === merchantId && payment.tenantId === tenantId,
    );
  }
}
