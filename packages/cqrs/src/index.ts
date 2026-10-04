/* Copyright (C) 2026-present Aristotelis — see repository license. */

export { CommandBus } from './command.bus.js';
export {
  type Cqrs,
  type CqrsOptions,
  createCqrs,
} from './create-cqrs.js';
export {
  CommandHandler,
  EventsHandler,
  QueryHandler,
  type RequestType,
} from './decorators.js';
export type { Dispatch } from './dispatch.js';
export {
  CommandHandlerNotFoundException,
  InvalidCommandHandlerException,
  InvalidEventsHandlerException,
  InvalidQueryHandlerException,
  QueryHandlerNotFoundException,
} from './errors.js';
export {
  EventBus,
  type EventBusOptions,
  type EventSubscriber,
} from './event.bus.js';
export type {
  ICommand,
  ICommandHandler,
  IEvent,
  IEventHandler,
  IQuery,
  IQueryHandler,
  UnhandledExceptionInfo,
} from './interfaces.js';
export { QueryBus } from './query.bus.js';
export {
  type Subscription,
  UnhandledExceptionBus,
} from './unhandled-exception.bus.js';
