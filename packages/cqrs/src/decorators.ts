/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type BehaviorId,
  type Constructor,
  type IPipelineBehavior,
  normalizeBehaviorEntries,
  type PipelineBehaviorEntry,
} from '@cqrs-ddd/pipeline';

const COMMAND_HANDLER = Symbol.for('@cqrs-ddd/cqrs:command-handler');
const QUERY_HANDLER = Symbol.for('@cqrs-ddd/cqrs:query-handler');
const EVENTS_HANDLER = Symbol.for('@cqrs-ddd/cqrs:events-handler');
const PIPELINE = Symbol.for('@cqrs-ddd/cqrs:pipeline');
const SKIPPED = Symbol.for('@cqrs-ddd/cqrs:skipped');

/** A class, of a request or of a handler, whatever its constructor takes. */
// biome-ignore lint/suspicious/noExplicitAny: constructors take any arguments
export type AnyClass = abstract new (...args: any[]) => unknown;

/** A request class: a command, a query or an event. */
export type RequestType = AnyClass;

/**
 * A class decorator for the standard and the `experimentalDecorators` mode: it receives
 * the class, and a context only in the standard mode.
 */
export type DualClassDecorator = (
  target: AnyClass,
  context?: ClassDecoratorContext,
) => void;

/** The pipeline a handler class declares with `@UsePipeline` and `@SkipPipeline`. */
export interface HandlerPipeline {
  readonly types: Constructor<IPipelineBehavior>[];
  readonly options: Map<BehaviorId, Record<string, unknown>>;
  readonly skipped: Constructor<IPipelineBehavior>[];
}

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
 * Declares the behaviors that run around a handler, outermost first: behavior classes or
 * `[Behavior, options]` tuples such as `cache({ key })`. The global behaviors of
 * `createCqrs()` wrap these; a behavior declared in both runs once, at its
 * global position, with these options merged over the global ones.
 *
 * @throws TypeError on a malformed entry.
 * @example
 * ```ts
 * @CommandHandler(CreateUserCommand)
 * @UsePipeline(idempotent({ keyFactory }), audit({ action: 'user.create' }))
 * class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
 *   async execute(command: CreateUserCommand) {}
 * }
 * ```
 */
export function UsePipeline(
  ...entries: PipelineBehaviorEntry[]
): DualClassDecorator {
  return (target, context) => {
    const name = String(context?.name ?? target.name);
    const { types, options } = normalizeBehaviorEntries(
      entries,
      `@UsePipeline on ${name}`,
    );
    define(target, PIPELINE, { types, options });
  };
}

/**
 * Opts a handler out of the global behaviors of `createCqrs()`. Repeated
 * decorators add up.
 *
 * @throws TypeError when an argument is not a behavior class.
 * @example
 * ```ts
 * @QueryHandler(HealthQuery)
 * @SkipPipeline(LoggingBehavior, TraceBehavior)
 * class HealthHandler implements IQueryHandler<HealthQuery> {
 *   async execute() {
 *     return 'ok';
 *   }
 * }
 * ```
 */
export function SkipPipeline(
  ...behaviors: Constructor<IPipelineBehavior>[]
): DualClassDecorator {
  return (target, context) => {
    const name = String(context?.name ?? target.name);
    const existing =
      read<Constructor<IPipelineBehavior>[]>(target, SKIPPED) ?? [];
    define(
      target,
      SKIPPED,
      normalizeBehaviorEntries(
        [...existing, ...behaviors],
        `@SkipPipeline on ${name}`,
        false,
      ).types,
    );
  };
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

/**
 * The pipeline a handler class declares; empty when it declares none.
 *
 * @example
 * ```ts
 * pipelineOf(CreateUserHandler).types; // [IdempotencyBehavior, AuditBehavior]
 * ```
 */
export function pipelineOf(handler: AnyClass): HandlerPipeline {
  const declared = read<Omit<HandlerPipeline, 'skipped'>>(handler, PIPELINE);
  return {
    types: declared?.types ?? [],
    options: declared?.options ?? new Map(),
    skipped: read<Constructor<IPipelineBehavior>[]>(handler, SKIPPED) ?? [],
  };
}
