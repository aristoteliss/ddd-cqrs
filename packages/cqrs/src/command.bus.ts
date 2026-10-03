/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Command } from './classes.js';
import type { RequestType } from './decorators.js';
import { type Dispatch, nearest } from './dispatch.js';
import { CommandHandlerNotFoundException } from './errors.js';
import type { ICommand } from './interfaces.js';

/**
 * Sends a command to its one handler, through the handler's pipeline.
 * `CqrsFactory.create()` builds it; `app.get(CommandBus)` and handler constructors
 * receive it.
 *
 * @example
 * ```ts
 * const commandBus = app.get(CommandBus);
 * const id = await commandBus.execute(new CreateUserCommand('ann'));
 * ```
 */
export class CommandBus<C extends ICommand = ICommand> {
  /**
   * @param handlers - Maps each command class to the function that runs its handler. The
   *   bus reads it at every call, so it can be filled after the bus is created, as
   *   handlers that inject the bus require.
   */
  constructor(private readonly handlers: ReadonlyMap<RequestType, Dispatch>) {}

  /**
   * Runs the handler of the command's class, or of its nearest parent class that has
   * one, and resolves with what the handler returns. A `Command<R>` gives the result
   * type.
   *
   * @throws CommandHandlerNotFoundException (as a rejection) when no class in the
   *   command's chain has a handler.
   * @example
   * ```ts
   * await commandBus.execute(new CreateUserCommand('ann'));
   * ```
   */
  execute<R>(command: Command<R>): Promise<R>;
  execute<T extends C, R = unknown>(command: T): Promise<R>;
  async execute(command: ICommand): Promise<unknown> {
    const type = command.constructor;
    const run = nearest(this.handlers, type);
    if (!run) throw new CommandHandlerNotFoundException(type.name);
    return run(command);
  }
}
