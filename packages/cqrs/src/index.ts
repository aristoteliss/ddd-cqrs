/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  Command,
  type CommandResult,
  Query,
  type QueryResult,
  RESULT_TYPE_SYMBOL,
} from './classes.js';
export { CommandBus } from './command.bus.js';
export {
  type Cqrs,
  type CqrsOptions,
  createCqrs,
} from './create-cqrs.js';
export {
  type AnyClass,
  CommandHandler,
  commandOf,
  type DualClassDecorator,
  EventsHandler,
  eventsOf,
  type HandlerPipeline,
  pipelineOf,
  QueryHandler,
  queryOf,
  type RequestType,
  SkipPipeline,
  UsePipeline,
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
export { EventPublisher } from './event.publisher.js';
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
