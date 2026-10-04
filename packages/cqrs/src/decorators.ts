/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { AnyClass, DualClassDecorator } from '@cqrs-ddd/pipeline';

const COMMAND_HANDLER = Symbol.for('@cqrs-ddd/cqrs:command-handler');
const QUERY_HANDLER = Symbol.for('@cqrs-ddd/cqrs:query-handler');
const EVENTS_HANDLER = Symbol.for('@cqrs-ddd/cqrs:events-handler');

/** A request class: a command, a query or an event. */
export type RequestType = AnyClass;

function define(target: AnyClass, key: symbol, value: unknown): void {
  Object.defineProperty(target, key, { value, configurable: true });
}

function read<T>(target: AnyClass, key: symbol): T | undefined {
  return (target as unknown as Record<symbol, T | undefined>)[key];
}

function requireRequestType(value: unknown, decorator: string): void {
  if (typeof value !== 'function') {
    throw new TypeError(
      `${decorator} takes a request class, received ${value === null ? 'null' : typeof value}.`,
    );
  }
}

/**
 * Registers a class as the handler of one command class; the class implements
 * `ICommandHandler`.
 *
 * @throws TypeError when `command` is not a class.
 * @example
 * ```ts
 * @CommandHandler(CreateUserCommand)
 * class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
 *   async execute(command: CreateUserCommand) {}
 * }
 * ```
 */
export function CommandHandler(command: RequestType): DualClassDecorator {
  requireRequestType(command, '@CommandHandler');
  return (target) => define(target, COMMAND_HANDLER, command);
}

/**
 * Registers a class as the handler of one query class; the class implements
 * `IQueryHandler`.
 *
 * @throws TypeError when `query` is not a class.
 * @example
 * ```ts
 * @QueryHandler(GetUserQuery)
 * class GetUserHandler implements IQueryHandler<GetUserQuery> {
 *   async execute(query: GetUserQuery) {}
 * }
 * ```
 */
export function QueryHandler(query: RequestType): DualClassDecorator {
  requireRequestType(query, '@QueryHandler');
  return (target) => define(target, QUERY_HANDLER, query);
}

/**
 * Registers a class as a handler of one or more event classes; the class implements
 * `IEventHandler`.
 *
 * @throws TypeError when no event class is given, or one is not a class.
 * @example
 * ```ts
 * @EventsHandler(UserCreatedEvent, UserInvitedEvent)
 * class SendWelcomeEmail implements IEventHandler<UserCreatedEvent | UserInvitedEvent> {
 *   async handle(event: UserCreatedEvent | UserInvitedEvent) {}
 * }
 * ```
 */
export function EventsHandler(...events: RequestType[]): DualClassDecorator {
  if (events.length === 0) {
    throw new TypeError('@EventsHandler takes at least one event class.');
  }
  for (const event of events) requireRequestType(event, '@EventsHandler');
  return (target) => define(target, EVENTS_HANDLER, events);
}

/**
 * The command class a handler class handles, if it is a command handler.
 *
 * @example
 * ```ts
 * commandOf(CreateUserHandler); // CreateUserCommand
 * ```
 */
export function commandOf(handler: AnyClass): RequestType | undefined {
  return read<RequestType>(handler, COMMAND_HANDLER);
}

/**
 * The query class a handler class handles, if it is a query handler.
 *
 * @example
 * ```ts
 * queryOf(GetUserHandler); // GetUserQuery
 * ```
 */
export function queryOf(handler: AnyClass): RequestType | undefined {
  return read<RequestType>(handler, QUERY_HANDLER);
}

/**
 * The event classes a handler class handles, if it is an events handler.
 *
 * @example
 * ```ts
 * eventsOf(SendWelcomeEmail); // [UserCreatedEvent]
 * ```
 */
export function eventsOf(
  handler: AnyClass,
): readonly RequestType[] | undefined {
  return read<RequestType[]>(handler, EVENTS_HANDLER);
}
