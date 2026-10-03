/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** A command: a request to change state, handled by exactly one handler. */
// biome-ignore lint/suspicious/noEmptyInterface: a marker, as in NestJS CQRS
export interface ICommand {}

/** A query: a request to read, handled by exactly one handler. */
// biome-ignore lint/suspicious/noEmptyInterface: a marker, as in NestJS CQRS
export interface IQuery {}

/** An event: something that happened, handled by any number of handlers. */
// biome-ignore lint/suspicious/noEmptyInterface: a marker, as in NestJS CQRS
export interface IEvent {}

/**
 * Handles one command class, registered with `@CommandHandler(Command)`.
 *
 * @example
 * ```ts
 * @CommandHandler(CreateUserCommand)
 * class CreateUserHandler implements ICommandHandler<CreateUserCommand, string> {
 *   async execute(command: CreateUserCommand): Promise<string> {
 *     return users.create(command.name);
 *   }
 * }
 * ```
 */
export interface ICommandHandler<
  TCommand extends ICommand = ICommand,
  TResult = unknown,
> {
  execute(command: TCommand): Promise<TResult>;
}

/**
 * Handles one query class, registered with `@QueryHandler(Query)`.
 *
 * @example
 * ```ts
 * @QueryHandler(GetUserQuery)
 * class GetUserHandler implements IQueryHandler<GetUserQuery, User | null> {
 *   async execute(query: GetUserQuery) {
 *     return users.find(query.id);
 *   }
 * }
 * ```
 */
export interface IQueryHandler<
  TQuery extends IQuery = IQuery,
  TResult = unknown,
> {
  execute(query: TQuery): Promise<TResult>;
}

/**
 * Handles one or more event classes, registered with `@EventsHandler(...Events)`.
 *
 * @example
 * ```ts
 * @EventsHandler(UserCreatedEvent)
 * class SendWelcomeEmail implements IEventHandler<UserCreatedEvent> {
 *   async handle(event: UserCreatedEvent) {
 *     await mailer.welcome(event.email);
 *   }
 * }
 * ```
 */
export interface IEventHandler<TEvent extends IEvent = IEvent> {
  handle(event: TEvent): unknown;
}

/**
 * An event handler failure that nothing awaited, as published on the
 * `UnhandledExceptionBus`.
 */
export interface UnhandledExceptionInfo<Cause = IEvent, Exception = unknown> {
  /** What the handler threw. */
  exception: Exception;
  /** The event the handler was handling. */
  cause: Cause;
}
