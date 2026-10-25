/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { RateLimitExceededError } from '@cqrs-ddd/pipeline-rate-limit';
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';
import { afterAll, describe, expect, it } from 'vitest';
import { memoryCqrs } from '../../../../../test/support/harness.js';
import { InvalidRefreshTokenError } from '../../../domain/models/errors/refresh-token.errors.js';
import { NodeRefreshTokens } from '../../../infrastructure/node-refresh-tokens.js';
import type { PrincipalLoginService } from '../../../services/principal-login.service.js';
import { RefreshAuthCommand } from './refresh-auth.command.js';
import { RefreshAuthHandler } from './refresh-auth.handler.js';

const unavailable = new Error('session store unavailable');
const { cqrs, deadLetters } = await memoryCqrs('refresh-auth-spec');
cqrs.register(
  new RefreshAuthHandler(
    cqrs.eventBus,
    {
      find: async (query) => {
        if (query.tokenHash === new NodeRefreshTokens().hash('unavailable')) {
          throw unavailable;
        }
        return null;
      },
    },
    { find: async () => null },
    new NodeRefreshTokens(),
    { save() {}, clear() {} },
    {} as PrincipalLoginService,
  ),
);

afterAll(() => cqrs.close());

const refresh = (refreshToken: string, clientIp: string) =>
  runWithTenant('tenant_a', () =>
    cqrs.commandBus.execute(new RefreshAuthCommand({ refreshToken, clientIp })),
  );

describe('RefreshAuthHandler pipeline', () => {
  it('rate-limits refreshes per tenant and client IP, never keyed by the refresh token', async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await expect(
        refresh('secret-token-123', '203.0.113.7'),
      ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    }

    const limited = await refresh('secret-token-123', '203.0.113.7').catch(
      (error: unknown) => error,
    );
    expect(limited).toBeInstanceOf(RateLimitExceededError);
    expect((limited as RateLimitExceededError).key).toContain('tenant_a');
    expect((limited as RateLimitExceededError).key).toContain('203.0.113.7');
    expect((limited as RateLimitExceededError).key).not.toContain(
      'secret-token-123',
    );
    await expect(
      refresh('secret-token-123', '203.0.113.8'),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('leaves a failed refresh out of the dead-letter queue', async () => {
    await expect(refresh('unavailable', '198.51.100.1')).rejects.toBe(
      unavailable,
    );

    expect(deadLetters).toEqual([]);
  });
});
