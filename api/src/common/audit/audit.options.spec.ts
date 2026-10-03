/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { sessionPrincipalStore } from '../context/session-principal.store.js';
import {
  AUDIT_DEFAULTS,
  claimedIdentityActor,
  sessionAuditActor,
} from './audit.options.js';

describe('sessionAuditActor', () => {
  it('resolves actor from active session principal', () => {
    sessionPrincipalStore.run(
      {
        id: 'user-1',
        tenant: 'tenant-a',
        type: 'user',
        email: 'user@test.com',
      },
      () => {
        const actor = sessionAuditActor();
        expect(actor).toEqual({
          id: 'user-1',
          authenticated: true,
          principalType: 'user',
          email: 'user@test.com',
        });
      },
    );
  });

  it('returns unauthenticated actor when session store is empty', () => {
    const actor = sessionAuditActor();
    expect(actor).toEqual({ authenticated: false });
    expect(actor.id).toBeUndefined();
    expect(actor.authenticated).toBe(false);
  });

  it('records a pre-authentication claim without an actor identity', () => {
    const actor = claimedIdentityActor('attacker@evil.test');

    expect(actor).toEqual({
      authenticated: false,
      claimedEmail: 'attacker@evil.test',
    });
    expect(actor).not.toHaveProperty('id');
  });

  it('omits the claim rather than fabricating one when no identity is supplied', () => {
    expect(claimedIdentityActor(undefined)).toEqual({ authenticated: false });
    expect(claimedIdentityActor('')).toEqual({ authenticated: false });
  });

  it('does not mutate the shared unauthenticated actor when adding a claim', () => {
    claimedIdentityActor('someone@corp.test');

    expect(sessionAuditActor()).toEqual({ authenticated: false });
  });

  it('provides the actor resolver in the audit defaults', () => {
    expect(AUDIT_DEFAULTS.actor).toBe(sessionAuditActor);
  });
});
