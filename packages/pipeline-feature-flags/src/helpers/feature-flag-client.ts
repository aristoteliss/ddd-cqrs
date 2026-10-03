/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type Client,
  NOOP_PROVIDER,
  OpenFeature,
} from '@openfeature/server-sdk';
import type { FeatureFlagClientOptions } from '../interfaces/feature-flags-options.interface.js';

/**
 * Resolves the OpenFeature client a {@link FeatureFlagBehavior} evaluates with: the given
 * `client`, or the client of `domain` (the default client without one) after registering
 * `provider`, waiting for it to be ready unless `waitForReady` is `false`.
 *
 * @example
 * ```ts
 * const client = await createFeatureFlagClient({ provider: new UnleashProvider(config) });
 * const behavior = new FeatureFlagBehavior(client);
 * ```
 */
export async function createFeatureFlagClient(
  options: FeatureFlagClientOptions = {},
): Promise<Client> {
  if (options.client) return options.client;
  if (options.provider) {
    if (options.waitForReady === false) {
      options.domain
        ? OpenFeature.setProvider(options.domain, options.provider)
        : OpenFeature.setProvider(options.provider);
    } else {
      await (options.domain
        ? OpenFeature.setProviderAndWait(options.domain, options.provider)
        : OpenFeature.setProviderAndWait(options.provider));
    }
  }
  return options.domain
    ? OpenFeature.getClient(options.domain)
    : OpenFeature.getClient();
}

/**
 * Unregisters the provider that {@link createFeatureFlagClient} registered for the same
 * `options`, for shutdown: the domain falls back to OpenFeature's no-op provider. Does
 * nothing when `options` gave a `client`, gave no `provider`, or another provider has
 * replaced it since.
 *
 * @example
 * ```ts
 * process.on('SIGTERM', () => releaseFeatureFlagProvider(options));
 * ```
 */
export async function releaseFeatureFlagProvider(
  options: FeatureFlagClientOptions = {},
): Promise<void> {
  const { client, provider, domain } = options;
  if (client || !provider) return;
  const current = domain
    ? OpenFeature.getProvider(domain)
    : OpenFeature.getProvider();
  if (current !== provider) return;
  await (domain
    ? OpenFeature.setProviderAndWait(domain, NOOP_PROVIDER)
    : OpenFeature.setProviderAndWait(NOOP_PROVIDER));
}
