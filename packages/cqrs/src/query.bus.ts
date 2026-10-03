/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Query } from './classes.js';
import type { RequestType } from './decorators.js';
import { type Dispatch, nearest } from './dispatch.js';
import { QueryHandlerNotFoundException } from './errors.js';
import type { IQuery } from './interfaces.js';

/**
 * Sends a query to its one handler, through the handler's pipeline.
 * `CqrsFactory.create()` builds it; `app.get(QueryBus)` and handler constructors
 * receive it.
 *
 * @example
 * ```ts
 * const queryBus = app.get(QueryBus);
 * const user = await queryBus.execute(new GetUserQuery('u-1'));
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
   * one, and resolves with what the handler returns. A `Query<R>` gives the result
   * type.
   *
   * @throws QueryHandlerNotFoundException (as a rejection) when no class in the
   *   query's chain has a handler.
   * @example
   * ```ts
   * await queryBus.execute(new GetUserQuery('u-1'));
   * ```
   */
  execute<R>(query: Query<R>): Promise<R>;
  execute<T extends Q, R = unknown>(query: T): Promise<R>;
  async execute(query: IQuery): Promise<unknown> {
    const type = query.constructor;
    const run = nearest(this.handlers, type);
    if (!run) throw new QueryHandlerNotFoundException(type.name);
    return run(query);
  }
}
