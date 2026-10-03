/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { OpenFeature, type Provider } from '@openfeature/server-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFeatureFlagClient,
  releaseFeatureFlagProvider,
} from './feature-flag-client.js';

vi.mock('@openfeature/server-sdk', () => ({
  NOOP_PROVIDER: { metadata: { name: 'noop' } },
  OpenFeature: {
    setProvider: vi.fn(),
    setProviderAndWait: vi.fn().mockResolvedValue(undefined),
    getClient: vi.fn((domain?: string) => ({
      name: domain ?? 'default-client',
    })),
    getProvider: vi.fn(),
  },
}));

const provider = { metadata: { name: 'fake' } } as unknown as Provider;

beforeEach(() => vi.clearAllMocks());

describe('createFeatureFlagClient', () => {
  it('returns the explicit client without touching OpenFeature', async () => {
    const explicit = { name: 'explicit' } as never;

    await expect(
      createFeatureFlagClient({ client: explicit, provider }),
    ).resolves.toBe(explicit);
    expect(OpenFeature.setProviderAndWait).not.toHaveBeenCalled();
  });

  it('awaits provider readiness by default, then returns the default client', async () => {
    await expect(createFeatureFlagClient({ provider })).resolves.toEqual({
      name: 'default-client',
    });
    expect(OpenFeature.setProviderAndWait).toHaveBeenCalledWith(provider);
  });

  it('binds the provider to a domain', async () => {
    await expect(
      createFeatureFlagClient({ provider, domain: 'billing' }),
    ).resolves.toEqual({
      name: 'billing',
    });
    expect(OpenFeature.setProviderAndWait).toHaveBeenCalledWith(
      'billing',
      provider,
    );
  });

  it('registers without waiting when waitForReady is false', async () => {
    await createFeatureFlagClient({ provider, waitForReady: false });
    await createFeatureFlagClient({
      provider,
      domain: 'billing',
      waitForReady: false,
    });

    expect(OpenFeature.setProvider).toHaveBeenNthCalledWith(1, provider);
    expect(OpenFeature.setProvider).toHaveBeenNthCalledWith(
      2,
      'billing',
      provider,
    );
    expect(OpenFeature.setProviderAndWait).not.toHaveBeenCalled();
  });

  it('returns the ambient client without registering when given neither', async () => {
    await expect(createFeatureFlagClient()).resolves.toEqual({
      name: 'default-client',
    });
    expect(OpenFeature.setProvider).not.toHaveBeenCalled();
  });
});

describe('releaseFeatureFlagProvider', () => {
  it('replaces the provider it registered with the no-op provider', async () => {
    vi.mocked(OpenFeature.getProvider).mockReturnValue(provider);
    await releaseFeatureFlagProvider({ provider });
    await releaseFeatureFlagProvider({ provider, domain: 'billing' });

    expect(OpenFeature.setProviderAndWait).toHaveBeenNthCalledWith(1, {
      metadata: { name: 'noop' },
    });
    expect(OpenFeature.setProviderAndWait).toHaveBeenNthCalledWith(
      2,
      'billing',
      {
        metadata: { name: 'noop' },
      },
    );
  });

  it('leaves the provider alone when a client was given, none was registered, or another replaced it', async () => {
    vi.mocked(OpenFeature.getProvider).mockReturnValue({} as Provider);
    await releaseFeatureFlagProvider({ client: {} as never, provider });
    await releaseFeatureFlagProvider();
    await releaseFeatureFlagProvider({ provider });

    expect(OpenFeature.setProviderAndWait).not.toHaveBeenCalled();
  });
});
