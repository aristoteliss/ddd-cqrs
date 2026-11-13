/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash } from 'node:crypto';
import {
  type CacheFillOptions,
  type CacheSetOptions,
  type CacheStateEntry,
  type IVersionedCache,
} from '@cqrs-ddd/core/application';
import type { ICacheLogger } from '@cqrs-ddd/core/persistence';
import { consoleCacheLogger, safeWarn } from '@cqrs-ddd/core/persistence';
import type { EntityManager } from '@mikro-orm/core';
import type { IEntityManagerSource } from '../interfaces/entity-manager-source.js';
import { CacheEntry } from './cache-entry.js';

/**
 * Reads the committed row inside a CAS transaction, bypassing the identity map
 * so a concurrent writer's revision is always observed.
 */
function readCommittedEntry(em: EntityManager, key: string) {
  return em.findOne(
    CacheEntry,
    { key },
    { refresh: true, disableIdentityMap: true },
  );
}

/**
 * An {@link IEntityManagerSource} that can also run work in a transaction.
 *
 * `transactional` must run `work` on a manager dedicated to that call, never on
 * the caller's request or transaction manager, so the cache's compare-and-set
 * steps commit on their own and never join a surrounding unit of work.
 * `em.fork().transactional(work)` satisfies it.
 */
function revisionOf(entry: CacheEntry): string {
  return (entry.revision ?? '0').toString();
}

/** The fields of a cache row that a write replaces. */
interface EntryContent {
  readonly value: string;
  readonly expiresAt: number | null;
}

/** Inserts the row of `key` at revision 1; a row that exists is left as it is. */
async function insertFirst(
  em: EntityManager,
  key: string,
  content: EntryContent,
): Promise<void> {
  // `onConflictAction: 'ignore'` keeps a lost insert race from aborting
  // the surrounding transaction, so the caller can re-read and retry.
  await em.upsert(
    CacheEntry,
    { key, ...content, revision: '1' },
    { onConflictAction: 'ignore' },
  );
}

/**
 * Replaces the content of `existing` and advances its revision, if no other
 * writer advanced it first.
 *
 * @returns The new revision, or `undefined` when the row changed meanwhile.
 */
async function advance(
  em: EntityManager,
  existing: CacheEntry,
  content: EntryContent,
): Promise<string | undefined> {
  const revision = (BigInt(revisionOf(existing)) + 1n).toString();
  const affected = await em.nativeUpdate(
    CacheEntry,
    { key: existing.key, revision: existing.revision },
    { ...content, revision },
  );
  return affected > 0 ? revision : undefined;
}

export interface ITransactionalEntityManagerSource
  extends IEntityManagerSource {
  transactional<T>(work: (em: EntityManager) => Promise<T>): Promise<T>;
}

/** Options for {@link MikroOrmCache}. */
export interface MikroOrmCacheOptions {
  /** Time to live in milliseconds when a write passes none; `0` never expires. Default 60,000. */
  readonly defaultTtlMs?: number;
  /**
   * Receives cache-maintenance warnings. Defaults to `console.warn` with a
   * `[MikroOrmCache]` prefix. See {@link ICacheLogger}.
   */
  readonly logger?: ICacheLogger;
}

/**
 * Upper bound on compare-and-set re-reads. Each iteration only repeats after a
 * competing writer won the row, so the bound exists to guarantee termination if
 * the underlying store never reflects a write, not to limit real contention.
 */
const MAX_CAS_ATTEMPTS = 16;

/** Raised when a compare-and-set loop cannot converge. */
class CacheCasExhaustedError extends Error {
  constructor(operation: string, key: string) {
    super(
      `MikroOrmCache.${operation} could not settle key "${key}" after ${MAX_CAS_ATTEMPTS} attempts.`,
    );
    this.name = 'CacheCasExhaustedError';
  }
}

/**
 * MikroORM-backed {@link IVersionedCache}: one row per key in the table mapped by
 * {@link CacheEntrySchema} (or {@link createCacheEntrySchema}).
 *
 * Implements {@link IVersionedCache} with revision-fenced atomic coordination,
 * bypassing the identity map across all read and mutation operations. Reads use
 * `store.em`; every write runs in `store.transactional(...)`.
 *
 * A plain class with no framework dependency.
 *
 * @example
 * ```ts
 * const cache = new MikroOrmCache<UserSnapshot>(store, { defaultTtlMs: 60_000 });
 * ```
 */
export class MikroOrmCache<T> implements IVersionedCache<T> {
  readonly isVersioned = true as const;

  private readonly logger: ICacheLogger;
  private readonly defaultTtlMs: number;

  constructor(
    private readonly store: ITransactionalEntityManagerSource,
    options?: MikroOrmCacheOptions,
  ) {
    this.defaultTtlMs = options?.defaultTtlMs ?? 60_000;
    this.logger = options?.logger ?? consoleCacheLogger('MikroOrmCache');
  }

  /**
   * Observes the current key state and its revision token.
   * Reads bypass the identity map to guarantee authoritative persistence visibility.
   */
  async readState(key: string): Promise<CacheStateEntry<T>> {
    const entry = await this.store.em.findOne(
      CacheEntry,
      { key },
      { disableIdentityMap: true },
    );

    if (!entry) {
      return { status: 'miss', revision: '0' };
    }

    const revision = revisionOf(entry);

    if (!entry.value) {
      return { status: 'miss', revision };
    }

    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      return { status: 'expired', revision };
    }

    return {
      status: 'hit',
      value: JSON.parse(entry.value) as T,
      revision,
    };
  }

  /**
   * Atomically advances the revision for `key` and evicts the payload value.
   * Retains the entry to prevent ABA races during concurrent fills.
   */
  async invalidate(key: string): Promise<string> {
    return this.store.transactional((em) => invalidateEntry(em, key));
  }

  /**
   * Atomically checks that current revision matches `observedRevision`, writes
   * value, and advances revision on match.
   */
  async tryFill(
    key: string,
    observedRevision: string,
    value: T,
    options?: CacheFillOptions,
  ): Promise<boolean> {
    const content = this.contentOf(value, options?.ttl);

    return this.store.transactional(async (em) => {
      if (observedRevision === '0') return fillFirstRevision(em, key, content);

      const affected = await em.nativeUpdate(
        CacheEntry,
        { key, revision: observedRevision },
        { ...content, revision: (BigInt(observedRevision) + 1n).toString() },
      );
      return affected > 0;
    });
  }

  /**
   * Get a value from the cache by key. Handles TTL expiry and returns detached clone.
   */
  async get(key: string): Promise<T | undefined> {
    const state = await this.readState(key);
    return state.status === 'hit' ? state.value : undefined;
  }

  /**
   * Stores a value in the relational cache table with transactional CAS concurrency safety.
   */
  async set(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    const content = this.contentOf(value, options?.ttl);
    const isNewer = options?.isNewer;

    await this.store.transactional(async (em) => {
      for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
        const existing = await readCommittedEntry(em, key);
        if (!existing) {
          await insertFirst(em, key, content);
          continue;
        }

        const cached = isNewer ? this.unexpiredValue(existing, key) : undefined;
        if (isNewer && cached !== undefined && isNewer(cached, value)) return;
        if (await advance(em, existing, content)) return;
      }

      throw new CacheCasExhaustedError('set', key);
    });
  }

  /**
   * Removes the value and advances the key's revision, as invalidate() does; the
   * row is kept.
   */
  async delete(key: string): Promise<void> {
    await this.invalidate(key);
  }

  private contentOf(value: T, ttl = this.defaultTtlMs): EntryContent {
    return {
      value: JSON.stringify(value),
      expiresAt: ttl > 0 ? Date.now() + ttl : null,
    };
  }

  /**
   * The parsed value of an entry that holds one and has not expired; an
   * unparsable value is reported and read as absent.
   */
  private unexpiredValue(entry: CacheEntry, key: string): unknown {
    const hasLiveValue =
      !!entry.value &&
      (entry.expiresAt === null || entry.expiresAt >= Date.now());
    if (!hasLiveValue) return undefined;
    try {
      return JSON.parse(entry.value);
    } catch {
      // An unparsable entry is treated as absent so the CAS update can heal corrupted data.
      safeWarn(
        this.logger,
        `Failed to parse cached value (key digest: ${createHash('sha256').update(key).digest('hex')}); treating as absent.`,
      );
      return undefined;
    }
  }
}

/**
 * Advances the revision of `key` and clears its value in one compare-and-set
 * loop, inserting the row at revision 1 when it does not exist.
 */
async function invalidateEntry(
  em: EntityManager,
  key: string,
): Promise<string> {
  const cleared: EntryContent = { value: '', expiresAt: null };
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const existing = await readCommittedEntry(em, key);

    if (!existing) {
      await insertFirst(em, key, cleared);
      const inserted = await readCommittedEntry(em, key);
      if (inserted && revisionOf(inserted) === '1') return '1';
      continue;
    }

    const revision = await advance(em, existing, cleared);
    if (revision) return revision;
  }

  throw new CacheCasExhaustedError('invalidate', key);
}

/**
 * Fills a key observed at revision 0, absent or never revised, as revision 1;
 * a row that a competing writer revised first is left as it is.
 */
async function fillFirstRevision(
  em: EntityManager,
  key: string,
  content: EntryContent,
): Promise<boolean> {
  const existing = await readCommittedEntry(em, key);

  if (!existing) {
    await insertFirst(em, key, content);
    const inserted = await readCommittedEntry(em, key);
    // A competing writer won the insert; this fill observed revision 0
    // and must not overwrite it.
    return inserted !== null && inserted.value === content.value;
  }

  if (revisionOf(existing) !== '0') return false;
  return (await advance(em, existing, content)) !== undefined;
}
