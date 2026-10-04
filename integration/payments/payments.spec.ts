/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { UnauthorizedActionException } from '@cqrs-ddd/pipeline-casl';
import { FeatureDisabledError } from '@cqrs-ddd/pipeline-feature-flags';
import { RateLimitExceededError } from '@cqrs-ddd/pipeline-rate-limit';
import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { afterEach, describe, expect, it } from 'vitest';
import {
  asMerchant,
  currentMerchant,
  flags,
  ledger,
  type Merchant,
} from './composition.js';
import {
  GatewayTimeoutError,
  type PaymentGateway,
  PaymentService,
} from './payment-service.js';

/** A merchant with every payment rule; each test takes its own rate-limit bucket. */
const seller = (id: string): Merchant => ({
  id,
  rules: [
    { action: 'create', subject: 'Payment' },
    { action: 'read', subject: 'Payment' },
    { action: 'refund', subject: 'Payment' },
  ],
});
const viewer: Merchant = {
  id: 'm-viewer',
  rules: [{ action: 'read', subject: 'Payment' }],
};

/** A gateway that times out `failures` times, then captures. */
function gateway(failures = 0): PaymentGateway & { calls: number } {
  return {
    calls: 0,
    async capture(amount, currency) {
      this.calls += 1;
      if (this.calls <= failures) throw new GatewayTimeoutError('timeout');
      return `ref-${amount}-${currency}-${this.calls}`;
    },
  };
}

const charge = (amount = 1200) => ({
  paymentId: `p-${crypto.randomUUID()}`,
  amount,
  currency: 'EUR' as const,
});

afterEach(() => {
  ledger.records.length = 0;
});

describe('payments on the pipeline alone', () => {
  it('charges with the tenant and correlation id of the call, and audits it', async () => {
    const payments = new PaymentService(gateway());
    const payment = await asMerchant(seller('m-1'), 'acme', () =>
      payments.charge(charge()),
    );

    expect(payment).toMatchObject({
      merchantId: 'm-1',
      tenantId: 'acme',
      status: 'captured',
    });
    expect(ledger.records).toEqual([
      expect.objectContaining({
        action: 'payment.charge',
        outcome: 'success',
        tenantId: 'acme',
        correlationId: payment.correlationId,
        actor: { id: 'm-1' },
      }),
    ]);
  });

  it('retries a gateway timeout inside one audited attempt', async () => {
    const card = gateway(2);
    const payments = new PaymentService(card);

    await asMerchant(seller('m-2'), 'acme', () => payments.charge(charge()));

    expect(card.calls).toBe(3);
    expect(ledger.records.map((record) => record.outcome)).toEqual(['success']);
  });

  it('rejects invalid input before the gateway is called', async () => {
    const card = gateway();
    const payments = new PaymentService(card);

    await expect(
      asMerchant(seller('m-3'), 'acme', () => payments.charge(charge(-5))),
    ).rejects.toBeInstanceOf(ZodValidationError);
    expect(card.calls).toBe(0);
    expect(ledger.records.map((record) => record.outcome)).toEqual(['failure']);
  });

  it('refuses a merchant without the rule, or no merchant, before anything is audited', async () => {
    const payments = new PaymentService(gateway());

    await expect(
      asMerchant(viewer, 'acme', () => payments.charge(charge())),
    ).rejects.toBeInstanceOf(UnauthorizedActionException);
    await expect(payments.history()).rejects.toBeInstanceOf(
      UnauthorizedActionException,
    );
    expect(() => currentMerchant()).toThrow('No merchant is calling.');
    expect(ledger.records).toEqual([]);
  });

  it('limits each merchant to three charges a minute in a tenant', async () => {
    const payments = new PaymentService(gateway());
    const limited = seller('m-4');
    const attempt = () =>
      asMerchant(limited, 'acme', () => payments.charge(charge()));

    await attempt();
    await attempt();
    await attempt();
    await expect(attempt()).rejects.toBeInstanceOf(RateLimitExceededError);
    await expect(
      asMerchant(limited, 'globex', () => payments.charge(charge())),
    ).resolves.toMatchObject({ tenantId: 'globex' });
  });

  it('refunds only while the refunds flag is on', async () => {
    const payments = new PaymentService(gateway());
    const merchant = seller('m-5');
    const { id } = await asMerchant(merchant, 'acme', () =>
      payments.charge(charge()),
    );

    await expect(
      asMerchant(merchant, 'acme', () => payments.refund(id)),
    ).rejects.toBeInstanceOf(FeatureDisabledError);

    flags.putConfiguration({
      refunds: {
        disabled: false,
        variants: { on: true, off: false },
        defaultVariant: 'on',
      },
    });
    await expect(
      asMerchant(merchant, 'acme', () => payments.refund(id)),
    ).resolves.toMatchObject({ status: 'refunded' });
    await expect(
      asMerchant(merchant, 'acme', () => payments.refund('unknown')),
    ).resolves.toBeUndefined();
  });

  it("lists only the merchant's payments in the current tenant", async () => {
    const payments = new PaymentService(gateway());
    const merchant = seller('m-6');
    await asMerchant(merchant, 'acme', () => payments.charge(charge()));
    await asMerchant(merchant, 'globex', () => payments.charge(charge()));
    await asMerchant(seller('m-7'), 'acme', () => payments.charge(charge()));

    const history = await asMerchant(viewer, 'acme', () => payments.history());
    expect(history).toEqual([]);
    const own = await asMerchant(merchant, 'acme', () => payments.history());
    expect(own.map((payment) => payment.tenantId)).toEqual(['acme']);
  });
});
