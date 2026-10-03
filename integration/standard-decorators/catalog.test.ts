/* Copyright (C) 2026-present Aristotelis — see repository license. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MissingCachePartitionError } from '@cqrs-ddd/pipeline-cache';
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';
import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { Catalog } from './catalog.js';

describe('standard decorators', () => {
  it('keeps the prices and the cache entries of two tenants apart', async () => {
    const catalog = new Catalog();
    await runWithTenant('acme', () =>
      catalog.reprice({ sku: 'apple', price: '120' }),
    );
    await runWithTenant('globex', () =>
      catalog.reprice({ sku: 'apple', price: 95 }),
    );

    const acme = () => runWithTenant('acme', () => catalog.price('apple'));
    const globex = () => runWithTenant('globex', () => catalog.price('apple'));

    assert.equal(await acme(), 120);
    assert.equal(await acme(), 120);
    assert.equal(await globex(), 95);
    assert.deepEqual(catalog.reads, ['acme/apple', 'globex/apple']);
  });

  it('fails a cached query that runs without a tenant', async () => {
    const error = await new Catalog().price('apple').catch((e: unknown) => e);

    assert.ok(error instanceof MissingCachePartitionError);
  });

  it('rejects an invalid command before the method runs', async () => {
    const error = await runWithTenant('acme', () =>
      new Catalog().reprice({ sku: '', price: -1 }),
    ).catch((e: unknown) => e);

    assert.ok(error instanceof ZodValidationError);
  });
});
