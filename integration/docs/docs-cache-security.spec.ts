/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Documentation contract regression test for cache security invariants.
 *
 * Prevents reintroducing unsafe cache key patterns in documentation,
 * specifically ensuring that examples with entity-level or field-level
 * authorization do not demonstrate unpartitioned or tenant-fallback cache keys,
 * and that correlation IDs are never presented as cache security boundaries.
 */
describe('Documentation cache security contracts', () => {
  const apiReadmePath = resolve(
    import.meta.dirname,
    '..',
    '..',
    'api',
    'README.md',
  );
  const cacheReadmePath = resolve(
    import.meta.dirname,
    '..',
    '..',
    'packages',
    'pipeline-cache',
    'README.md',
  );

  const cacheGuidePath = resolve(
    import.meta.dirname,
    '..',
    '..',
    'docs',
    'src',
    'content',
    'docs',
    'packages',
    'pipeline-cache.md',
  );

  const apiReadme = readFileSync(apiReadmePath, 'utf8');
  const cacheReadme = readFileSync(cacheReadmePath, 'utf8');
  const cacheGuide = readFileSync(cacheGuidePath, 'utf8');
  const allDocs = [apiReadme, cacheReadme, cacheGuide];

  it('does not contain unsafe tenant-only shared cache keys for authorized handlers', () => {
    expect(apiReadme).not.toContain("ctx.tenantId ?? 'default'}:roles:all");
    expect(apiReadme).not.toMatch(
      /key:\s*\(ctx\)\s*=>\s*`\$\{ctx\.tenantId.*:roles:all`/,
    );
  });

  it('does not demonstrate silent default tenant fallback in cache key factories', () => {
    for (const content of allDocs) {
      expect(content).not.toMatch(
        /key:\s*\(ctx\)\s*=>\s*`\$\{ctx\.tenantId\s*\?\?\s*['"]default['"]/,
      );
    }
  });

  it('documents the partitioned cache key contract', () => {
    expect(apiReadme).toContain('Authorization & Cache Security Scope');
    expect(apiReadme).toContain('createPartitionedCacheKeyFactory');
    expect(apiReadme).toContain('MissingCachePartitionError');

    expect(cacheGuide).toContain('createPartitionedCacheKeyFactory');
    expect(cacheGuide).toContain('MissingCachePartitionError');
  });

  it('presents no correlation-scoped key as safe by default in any documentation', () => {
    for (const content of allDocs) {
      expect(content).not.toMatch(/`defaultCacheKey\(\)`/);
      expect(content).not.toMatch(/defaultCacheKey\(\)\s+is\s+intentionally/i);
      expect(content).not.toMatch(
        /correlationId.*(security|authorization)\s+boundary/i,
      );
    }
  });
});
