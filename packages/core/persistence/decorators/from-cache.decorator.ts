/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type CacheStateEntry,
  type IVersionedCache,
  isVersionedCache,
} from '../../application/ports/cache.port.js';
import { IQueryOptions } from '../../application/query.options.js';
import type { ICacheLogger } from '../cache/cache-logger.js';
import { consoleCacheLogger, safeWarn } from '../cache/cache-logger.js';
import { isCacheMutationBarrier } from '../helpers/cache-barrier.helper.js';
import { reportMissingCacheProperty } from '../helpers/cache-owner.helper.js';
import { toCacheSnapshot } from '../helpers/cache-snapshot.helper.js';
import { isCacheNewer } from '../helpers/cache-version.helper.js';
import type {
  QueryRepository,
  QueryRepositoryHydration,
} from '../query-repository.abstract.js';

export { isCacheNewer };

const defaultLogger = consoleCacheLogger('FromCacheDecorator');

const warnedUnversionedAdapters = new WeakSet<object>();

const reportedUncacheable = new WeakSet<object>();

/**
 * Fills retried after a concurrent mutation rejects one, before the loaded
 * result is returned uncached.
 */
const MAX_FILL_RETRIES = 2;

/**
 * Reports an unversioned adapter once per instance: a silent loss of caching is
 * harder to diagnose than the race the bypass avoids.
 */
function warnUnversionedAdapterOnce(cache: object, logger: ICacheLogger): void {
  if (warnedUnversionedAdapters.has(cache)) return;
  warnedUnversionedAdapters.add(cache);
  safeWarn(
    logger,
    `${cache.constructor?.name ?? 'Cache adapter'} implements only get/set/delete, ` +
      'so @FromCache read-through is disabled for repositories using it. ' +
      'Implement IVersionedCache (readState/invalidate/tryFill) to enable ' +
      'revision-fenced caching.',
  );
}

/**
 * Options for configuring read-through caching and rehydration via {@link FromCache}.
 */
export interface FromCacheOptions<TQuery = unknown, TResult = unknown> {
  /**
   * Function deriving the cache key from query options.
   * When it returns `null`, caching is skipped for that call.
   */
  keyFn?: ((query: TQuery) => string | null) | null;

  /**
   * Function to rehydrate a raw cached snapshot back into a domain entity.
   * When omitted, the repository's {@link QueryRepositoryHydration} applies;
   * `null` opts this method out of it.
   */
  hydrateFn?: ((cached: unknown) => TResult) | null;

  /**
   * Optional serializer function to convert a domain entity or complex result into
   * a pure, detached snapshot for storage in cache.
   * If omitted, the repository's {@link QueryRepositoryHydration} serializer
   * applies, and otherwise {@link toCacheSnapshot} extracts a snapshot via
   * `result.toJSON()` or deep JSON cloning. `null` skips the repository default.
   */
  serializeFn?: ((result: TResult) => unknown) | null;

  /**
   * Requires `hydrateFn` at decoration time. Every hit is rehydrated whenever a
   * hydrator applies, so this flag does not change the result.
   */
  alwaysHydrate?: boolean;

  /**
   * Optional time-to-live in milliseconds for cached entries.
   */
  ttl?: number;

  /**
   * Optional version comparator for stale-read prevention during concurrent cache population.
   * Defaults to {@link isCacheNewer}.
   */
  isNewer?: (cached: unknown, incoming: unknown) => boolean;

  /**
   * Receives read-through warnings (unversioned adapter, uncacheable result, missing
   * `cache` property). Defaults to `console.warn` with a `[FromCacheDecorator]`
   * prefix. See {@link ICacheLogger}.
   */
  logger?: ICacheLogger;
}

/**
 * True for values whose cached JSON form equals the value itself: primitives,
 * arrays and plain objects of such values. Class instances and `Date` are not.
 */
function isPlainData(
  value: unknown,
  ancestors = new WeakSet<object>(),
): boolean {
  if (value === null || typeof value !== 'object') {
    return typeof value !== 'function' && typeof value !== 'bigint';
  }
  const prototype = Object.getPrototypeOf(value);
  const isPlainObject = prototype === Object.prototype || prototype === null;
  if (ancestors.has(value) || (!Array.isArray(value) && !isPlainObject)) {
    return false;
  }

  ancestors.add(value);
  const plain = Object.values(value).every((item) =>
    isPlainData(item, ancestors),
  );
  ancestors.delete(value);

  return plain;
}

/**
 * Read-through cache decorator for a {@link QueryRepository} `find` method.
 *
 * Provides declarative read-through caching with revision-fenced coordination:
 * - **Key derivation**: Generates a cache key via `keyFn`. If `keyFn` returns `null`, caching is skipped.
 * - **Snapshot storage contract**: Stores strictly serializable snapshots in the cache, never live domain aggregates.
 * - **Consistent result shape**: When a method or repository `hydrateFn` applies, every hit is rehydrated, so hits
 *   and misses return the same type. Without a hydrator only plain-data results are cached; any other result
 *   (a class instance, or a result reshaped by `serializeFn`) is returned uncached and reported once.
 * - **Revision-fenced consistency**: When coordinated via {@link IVersionedCache}, cache fill attempts verify the
 *   observed revision token atomically (`tryFill`). A fill started before an observed invalidation cannot
 *   repopulate the key afterwards.
 * - **Bounded retry**: Contended fills inspect current cache state and boundedly retry authoritative reads before
 *   falling back to un-cached database results.
 */
export function FromCache<
  TQuery extends IQueryOptions = IQueryOptions,
  TResult = unknown,
>(
  keyFnOrOptions:
    | ((query: TQuery) => string | null)
    | FromCacheOptions<TQuery, TResult>,
  hydrateFnOrOptions?:
    | ((cached: unknown) => TResult)
    | FromCacheOptions<TQuery, TResult>,
  extraOptions?: FromCacheOptions<TQuery, TResult>,
): MethodDecorator {
  const positionalKey = typeof keyFnOrOptions === 'function';
  const positionalHydrator =
    positionalKey && typeof hydrateFnOrOptions === 'function';
  let resolvedOptions = positionalKey ? hydrateFnOrOptions : keyFnOrOptions;
  if (typeof resolvedOptions === 'function') resolvedOptions = extraOptions;
  const resolvedKeyFn = positionalKey ? keyFnOrOptions : keyFnOrOptions.keyFn;
  const resolvedHydrateFn = positionalHydrator
    ? hydrateFnOrOptions
    : (resolvedOptions?.hydrateFn ?? undefined);
  const declaresHydrateFn =
    positionalHydrator ||
    (resolvedOptions !== undefined && 'hydrateFn' in resolvedOptions);
  const declaresSerializeFn =
    resolvedOptions !== undefined && 'serializeFn' in resolvedOptions;

  if (resolvedOptions?.alwaysHydrate && !resolvedHydrateFn) {
    throw new TypeError('FromCache: alwaysHydrate requires a hydrateFn');
  }

  const settings: FromCacheSettings<TQuery, TResult> = {
    options: resolvedOptions,
    keyFn: resolvedKeyFn,
    hydrateFn: resolvedHydrateFn,
    declaresHydrateFn,
    declaresSerializeFn,
    logger: resolvedOptions?.logger ?? defaultLogger,
  };

  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    descriptor.value = wrapFind(descriptor.value, settings);
  };
}

/** The configuration of one {@link FromCache} decorator. */
interface FromCacheSettings<TQuery, TResult> {
  readonly options: FromCacheOptions<TQuery, TResult> | undefined;
  readonly keyFn: ((query: TQuery) => string | null) | null | undefined;
  readonly hydrateFn: ((cached: unknown) => TResult) | undefined;
  readonly declaresHydrateFn: boolean;
  readonly declaresSerializeFn: boolean;
  readonly logger: ICacheLogger;
}

/** The hydrator and serializer one call applies. */
interface MethodHydration<TResult> {
  readonly hydrateFn: ((cached: unknown) => TResult) | null | undefined;
  readonly serializeFn: ((result: TResult) => unknown) | null | undefined;
}

/** One call's read-through of `key` on a revision-fenced adapter. */
interface FencedRead<TResult> extends MethodHydration<TResult> {
  readonly cache: IVersionedCache<unknown>;
  readonly key: string;
  readonly repository: object;
  readonly load: () => Promise<TResult>;
}

function wrapFind<TQuery extends IQueryOptions, TResult>(
  original: (query: TQuery) => Promise<TResult>,
  settings: FromCacheSettings<TQuery, TResult>,
) {
  return async function (
    this: QueryRepository<TQuery, TResult>,
    query: TQuery,
  ): Promise<TResult> {
    if (!this.cache) {
      reportMissingCacheProperty(this, '@FromCache', settings.options?.logger);
      return original.call(this, query);
    }
    if (query.refresh) return original.call(this, query);

    const { keyFn } = settings;
    if (!keyFn) throw new TypeError('FromCache requires a keyFn');
    const key = keyFn(query);

    if (key === null) {
      return original.call(this, query);
    }

    const hydration = methodHydration(settings, this.hydration);
    const load = () => original.call(this, query);

    // 1. Versioned coordination path (capable adapters)
    if (isVersionedCache(this.cache)) {
      return readThrough(
        { cache: this.cache, key, repository: this, load, ...hydration },
        settings,
      );
    }

    // 2. Unversioned adapter: with no revision to fence a fill against a
    // concurrent invalidation, the cache is bypassed for both reads and fills.
    warnUnversionedAdapterOnce(this.cache, settings.logger);

    return original.call(this, query);
  };
}

/**
 * Method-level options win; otherwise the repository policy applies, and a
 * repository hydrator rehydrates every hit.
 */
function methodHydration<TQuery, TResult>(
  settings: FromCacheSettings<TQuery, TResult>,
  repository: QueryRepositoryHydration<TResult> | undefined,
): MethodHydration<TResult> {
  return {
    hydrateFn: settings.declaresHydrateFn
      ? settings.hydrateFn
      : repository?.hydrateFn,
    serializeFn: settings.declaresSerializeFn
      ? settings.options?.serializeFn
      : repository?.serializeFn,
  };
}

/**
 * Serves a usable hit, or loads and fills the key through `tryFill` against the
 * revision observed before the load. A rejected fill re-reads the key: a newer
 * usable snapshot wins, and otherwise the load is retried up to
 * {@link MAX_FILL_RETRIES} times before its result is returned uncached.
 */
async function readThrough<TQuery, TResult>(
  read: FencedRead<TResult>,
  settings: FromCacheSettings<TQuery, TResult>,
): Promise<TResult> {
  const { cache, key, load, hydrateFn, serializeFn } = read;
  let observedState = await cache.readState(key);
  if (isUsableSnapshot(observedState)) {
    return hydrate(read, observedState.value);
  }

  for (let attempt = 0; ; attempt++) {
    const result = await load();
    if (result === null || result === undefined) {
      const postState = await cache.readState(key);
      return isUsableSnapshot(postState)
        ? hydrate(read, postState.value)
        : result;
    }

    // A hit without a hydrator returns the cached data as is, so only a
    // result that already is that data may be cached.
    if (!hydrateFn && (serializeFn || !isPlainData(result))) {
      reportUncacheableOnce(settings, read.repository);
      return result;
    }

    const snapshot = toCacheSnapshot(result, serializeFn);
    const committed = await cache.tryFill(
      key,
      observedState.revision,
      snapshot as never,
      { ttl: settings.options?.ttl },
    );
    if (committed) return result;

    const currentState = await cache.readState(key);
    if (isNewerSnapshot(currentState, snapshot, settings.options)) {
      return hydrate(read, currentState.value);
    }
    if (attempt === MAX_FILL_RETRIES) return result;
    observedState = currentState;
  }
}

function hydrate<TResult>(
  hydration: MethodHydration<TResult>,
  cached: unknown,
): TResult {
  const { hydrateFn } = hydration;
  return hydrateFn ? hydrateFn(cached) : (cached as TResult);
}

/**
 * A revision-fenced key can still hold a barrier written by an unversioned
 * writer against the same store; it is a sentinel, never a snapshot, so it
 * counts as a miss rather than something to hydrate. The same holds for
 * `null`: this decorator never fills one, so a stored null is a leftover from
 * another writer, not a cached absence.
 */
function isUsableSnapshot(state: CacheStateEntry<unknown>): boolean {
  return (
    state.status === 'hit' &&
    state.value !== undefined &&
    state.value !== null &&
    !isCacheMutationBarrier(state.value)
  );
}

/** Whether the state a rejected fill re-read holds a newer usable snapshot. */
function isNewerSnapshot<TQuery, TResult>(
  state: CacheStateEntry<unknown>,
  snapshot: unknown,
  options: FromCacheOptions<TQuery, TResult> | undefined,
): boolean {
  if (!isUsableSnapshot(state)) return false;
  const newerCheck = options?.isNewer ?? isCacheNewer;
  return newerCheck(state.value, snapshot);
}

/**
 * Reports, once per decorator, a result a hit could not reproduce without a
 * hydrator, so it is returned uncached.
 */
function reportUncacheableOnce<TQuery, TResult>(
  settings: FromCacheSettings<TQuery, TResult>,
  repository: object,
): void {
  if (reportedUncacheable.has(settings)) return;
  reportedUncacheable.add(settings);
  safeWarn(
    settings.logger,
    `${repository.constructor.name} caches a result that a hit could not reproduce without a hydrateFn; ` +
      'the result is returned uncached. Configure a hydrateFn or return plain data.',
  );
}
