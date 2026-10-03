/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createPipeline } from '@cqrs-ddd/pipeline';
import { describe, expect, it } from 'vitest';
import { CacheBehavior } from './cache.behavior.js';
import { cache } from './helpers/cache.intent.js';
import { buildCache } from './helpers/cache-factory.js';
import { createPartitionedCacheKeyFactory } from './helpers/cache-key.js';

const key = createPartitionedCacheKeyFactory({
  includeTenant: false,
  principal: () => 'public',
  requireScope: false,
});

describe('CacheBehavior on wrapped functions', () => {
  it('serves a repeated query from the cache and keeps two operations with equal arguments apart', async () => {
    const pipeline = createPipeline({
      behaviors: [new CacheBehavior(buildCache({}))],
    });
    let reads = 0;
    const getPrice = pipeline.wrap(
      { name: 'getPrice', kind: 'query' },
      cache({ key }),
    )(async (sku: string) => {
      reads += 1;
      return { fn: 'getPrice', sku };
    });
    const getStock = pipeline.wrap(
      { name: 'getStock', kind: 'query' },
      cache({ key }),
    )(async (sku: string) => ({ fn: 'getStock', sku }));

    await expect(getPrice('a')).resolves.toEqual({ fn: 'getPrice', sku: 'a' });
    await expect(getPrice('a')).resolves.toEqual({ fn: 'getPrice', sku: 'a' });
    expect(reads).toBe(1);
    await expect(getStock('a')).resolves.toEqual({ fn: 'getStock', sku: 'a' });
  });

  it('builds a tiered cache from a list of store configurations', async () => {
    const tiered = buildCache({
      store: [{ type: 'memory' }, { type: 'memory' }],
    });

    await tiered.set('k', 'v');
    await expect(tiered.get('k')).resolves.toBe('v');
    expect(tiered.stores).toHaveLength(2);
  });

  it('cannot be built without a cache', () => {
    expect(() => new CacheBehavior(undefined as never)).toThrow(
      'CacheBehavior requires a cache',
    );
  });
});
