/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Minimal structural shape of a `pg` `Pool` / `Client`. Declared here so no
 * package hard-depends on `pg` — a real `Pool` or `Client` satisfies it.
 * Add it in your app: `pnpm add pg`.
 *
 * `TResult` is the part of the query result the caller reads; the default
 * `unknown` suits a caller that only writes.
 */
export interface PostgresQueryableLike<TResult = unknown> {
  query(text: string, values?: unknown[]): Promise<TResult>;
}
