/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createPipeline } from '@cqrs-ddd/pipeline';
import { describe, expect, it } from 'vitest';
import { FeatureDisabledError } from './errors/feature-disabled.error.js';
import { FeatureFlagBehavior } from './feature-flag.behavior.js';
import { featureFlag } from './helpers/feature-flag.intent.js';
import { toHttpResponse } from './http.js';

function clientWith(enabled: Record<string, boolean>) {
  return {
    getBooleanDetails: async (flagKey: string, defaultValue: boolean) => ({
      flagKey,
      value: enabled[flagKey] ?? defaultValue,
      reason: 'STATIC',
      flagMetadata: {},
    }),
  } as never;
}

describe('FeatureFlagBehavior on wrapped functions', () => {
  const pipeline = createPipeline({
    behaviors: [new FeatureFlagBehavior(clientWith({ 'new-checkout': true }))],
  });

  it('runs the function while its flag is on, and refuses it while off with a 403 or hidden 404', async () => {
    const checkout = pipeline.wrap(
      { name: 'checkout', kind: 'command' },
      featureFlag({ flag: 'new-checkout' }),
    )(async () => 'ordered');
    const beta = pipeline.wrap(
      { name: 'beta', kind: 'query' },
      featureFlag({ flag: 'beta-search' }),
    )(async () => 'results');

    await expect(checkout()).resolves.toBe('ordered');
    const error = await beta().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FeatureDisabledError);
    expect(toHttpResponse(error as FeatureDisabledError)).toEqual({
      status: 403,
      body: {
        statusCode: 403,
        error: 'Forbidden',
        message: (error as FeatureDisabledError).message,
        flag: 'beta-search',
      },
      headers: {},
    });
    expect(
      toHttpResponse(error as FeatureDisabledError, { hideFeature: true }),
    ).toEqual({
      status: 404,
      body: { statusCode: 404, error: 'Not Found', message: 'Not Found' },
      headers: {},
    });
  });

  it('cannot be built without an OpenFeature client', () => {
    expect(() => new FeatureFlagBehavior(undefined as never)).toThrow(
      'FeatureFlagBehavior requires an OpenFeature client',
    );
  });
});
