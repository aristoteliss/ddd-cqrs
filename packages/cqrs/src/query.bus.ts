/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { RequestType } from './decorators.js';
import { type Dispatch, nearest } from './dispatch.js';
import { QueryHandlerNotFoundException } from './errors.js';
import type { IQuery } from './interfaces.js';

/**
 * Sends a query to its one handler, through the handler's pipeline. `createCqrs()`
 * builds it.
 *
 * @example
 * ```ts
 * const { queryBus } = createCqrs();
 * const user = await queryBus.execute<GetUserQuery, User | null>(new GetUserQuery('u-1'));
 * ```
 */
export class QueryBus<Q extends IQuery = IQuery> {
  /**
   * @param handlers - Maps each query class to the function that runs its handler. The
   *   bus reads it at every call, so it can be filled after the bus is created, as
   *   handlers that inject the bus require.
   */
  constructor(private readonly handlers: ReadonlyMap<RequestType, Dispatch>) {}

  /**
   * Runs the handler of the query's class, or of its nearest parent class that has
   * one, and resolves with what the handler returns, typed as `R`.
   *
   * @throws QueryHandlerNotFoundException (as a rejection) when no class in the
   *   query's chain has a handler.
   * @example
   * ```ts
   * await queryBus.execute(new GetUserQuery('u-1'));
   * ```
   */
  async execute<T extends Q, R = unknown>(query: T): Promise<R> {
    const type = query.constructor;
    const run = nearest(this.handlers, type);
    if (!run) throw new QueryHandlerNotFoundException(type.name);
    return (await run(query)) as R;
  }
}
