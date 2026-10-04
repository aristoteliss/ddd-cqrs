/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { REDACTED } from '@cqrs-ddd/pipeline-audit';
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';
import { afterAll, describe, expect, it } from 'vitest';
import { memoryCqrs } from '../../../../../test/support/harness.js';
import { InvalidLoginCredentialsException } from '../../../domain/errors/authentication.exception.js';
import { NodeRefreshTokens } from '../../../infrastructure/node-refresh-tokens.js';
import type { PrincipalLoginService } from '../../../services/principal-login.service.js';
import { CreateAuthCommand } from './create-auth.command.js';
import { CreateAuthHandler } from './create-auth.handler.js';

const { cqrs, audits } = await memoryCqrs('create-auth-audit-spec');
cqrs.register(
  new CreateAuthHandler(
    cqrs.eventBus,
    {
      authenticate: async () => {
        throw new InvalidLoginCredentialsException();
      },
    } as unknown as PrincipalLoginService,
    { save: async () => null },
    new NodeRefreshTokens(),
    {
      refreshTokenTtlSeconds: 60,
      refreshReuseGraceSeconds: 5,
      embedPermissions: false,
    },
    { save() {}, clear() {} },
  ),
);

afterAll(() => cqrs.close());

describe('CreateAuthHandler audit', () => {
  it('audits a refused login with the claimed email and without the login code', async () => {
    await expect(
      runWithTenant('tenant_a', () =>
        cqrs.commandBus.execute(
          new CreateAuthCommand({
            email: 'ann@example.test',
            code: '123456',
            clientIp: '203.0.113.7',
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(InvalidLoginCredentialsException);

    expect(audits).toEqual([
      expect.objectContaining({
        action: 'auth.login',
        outcome: 'failure',
        actor: { authenticated: false, claimedEmail: 'ann@example.test' },
        payload: {
          email: 'ann@example.test',
          code: REDACTED,
          clientIp: '203.0.113.7',
        },
      }),
    ]);
  });
});
