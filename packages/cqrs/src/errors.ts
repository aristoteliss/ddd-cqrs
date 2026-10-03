/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Thrown by `CommandBus.execute()` when no handler is registered for the command's class. */
export class CommandHandlerNotFoundException extends Error {
  override readonly name = 'CommandHandlerNotFoundException';

  constructor(commandName: string) {
    super(`No handler found for the command: "${commandName}".`);
  }
}

/** Thrown by `QueryBus.execute()` when no handler is registered for the query's class. */
export class QueryHandlerNotFoundException extends Error {
  override readonly name = 'QueryHandlerNotFoundException';

  constructor(queryName: string) {
    super(`No handler found for the query: "${queryName}"`);
  }
}

/** Thrown at startup by a command handler without an `execute` method. */
export class InvalidCommandHandlerException extends Error {
  override readonly name = 'InvalidCommandHandlerException';

  constructor() {
    super(
      `An invalid command handler has been provided. Please ensure that the provided handler is a class annotated with @CommandHandler and contains an 'execute' method.`,
    );
  }
}

/** Thrown at startup by a query handler without an `execute` method. */
export class InvalidQueryHandlerException extends Error {
  override readonly name = 'InvalidQueryHandlerException';

  constructor() {
    super(
      `An invalid query handler has been provided. Please ensure that the provided handler is a class annotated with @QueryHandler and contains an 'execute' method.`,
    );
  }
}

/** Thrown at startup by an events handler without a `handle` method. */
export class InvalidEventsHandlerException extends Error {
  override readonly name = 'InvalidEventsHandlerException';

  constructor() {
    super(
      `An invalid events handler has been provided. Please ensure that the provided handler is a class annotated with @EventsHandler and contains a 'handle' method.`,
    );
  }
}
