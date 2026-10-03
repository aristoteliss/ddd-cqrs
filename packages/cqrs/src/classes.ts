/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ICommand, IQuery } from './interfaces.js';

/** The key under which `Command` and `Query` carry their result type, for inference only. */
export const RESULT_TYPE_SYMBOL: unique symbol = Symbol.for(
  '@cqrs-ddd/cqrs:result-type',
);

/**
 * A command class that declares its result type, so `commandBus.execute()` infers it.
 *
 * @example
 * ```ts
 * class CreateUserCommand extends Command<{ id: string }> {
 *   constructor(readonly name: string) {
 *     super();
 *   }
 * }
 * const { id } = await commandBus.execute(new CreateUserCommand('ann'));
 * ```
 */
export class Command<T> implements ICommand {
  declare readonly [RESULT_TYPE_SYMBOL]: T;
}

/**
 * A query class that declares its result type, so `queryBus.execute()` infers it.
 *
 * @example
 * ```ts
 * class GetUserQuery extends Query<User | null> {
 *   constructor(readonly id: string) {
 *     super();
 *   }
 * }
 * const user = await queryBus.execute(new GetUserQuery('u-1'));
 * ```
 */
export class Query<T> implements IQuery {
  declare readonly [RESULT_TYPE_SYMBOL]: T;
}

/** The result type a `Command` declares. */
export type CommandResult<C extends Command<unknown>> =
  C extends Command<infer R> ? R : never;

/** The result type a `Query` declares. */
export type QueryResult<Q extends Query<unknown>> =
  Q extends Query<infer R> ? R : never;
