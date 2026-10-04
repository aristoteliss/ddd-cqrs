/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type {
  Constructor,
  IPipelineBehavior,
  PipelineLogger,
} from '@cqrs-ddd/pipeline';
import { CommandBus } from './command.bus.js';
import { commandOf, eventsOf, queryOf } from './decorators.js';
import { EventBus } from './event.bus.js';
import { QueryBus } from './query.bus.js';
import {
  behaviorResolver,
  Handlers,
  type RegistrationOptions,
  registerHandlers,
} from './registry.js';
import { UnhandledExceptionBus } from './unhandled-exception.bus.js';

/** Options of {@link createCqrs}. */
export interface CqrsOptions extends RegistrationOptions {
  /**
   * Instances of the behaviors that need dependencies, one per behavior class. A placed
   * behavior without an instance is built with no arguments, `LoggingBehavior` on
   * `logger`.
   */
  readonly behaviors?: readonly IPipelineBehavior[];
  /** The logger of `LoggingBehavior`, of failed event handlers and of the startup lines. */
  readonly logger?: PipelineLogger;
  /**
   * Throw a failed event handler's error as an uncaught exception instead of publishing it
   * on the `UnhandledExceptionBus` and logging it.
   * @default false
   */
  readonly rethrowUnhandled?: boolean;
}

/** The buses of {@link createCqrs}, and the handlers registered with them. */
export interface Cqrs {
  readonly commandBus: CommandBus;
  readonly queryBus: QueryBus;
  readonly eventBus: EventBus;
  readonly unhandledExceptionBus: UnhandledExceptionBus;
  /**
   * Registers handler instances: classes decorated with `@CommandHandler`,
   * `@QueryHandler` or `@EventsHandler`. Each handler's pipeline is compiled here, once.
   *
   * @throws TypeError on an undecorated handler, or a second command or query handler.
   * @throws PipelineConfigurationError on a behavior contract violation, in `'strict'`
   *   mode.
   */
  register(...handlers: object[]): void;
  /** Waits for the event handlers still running; call it before closing what they use. */
  close(): Promise<void>;
}

/**
 * Creates the command, query and event buses with no container: the application builds
 * its handlers with `new` and registers them. Global behaviors are built here, so one
 * whose required dependency is missing fails at once.
 *
 * @throws TypeError on two instances of one behavior class.
 * @example
 * ```ts
 * const cqrs = createCqrs({
 *   behaviors: [new AuditBehavior(sink)],
 *   globalBehaviors: { before: [LoggingBehavior] },
 *   sources: { tenantId: tenantSource, correlationId: correlationSource },
 * });
 * cqrs.register(new CreateUserHandler(users, cqrs.eventBus), new GetUserHandler(users));
 *
 * const id = await cqrs.commandBus.execute(new CreateUserCommand('Ann'));
 * await cqrs.close();
 * ```
 */
export function createCqrs(options: CqrsOptions = {}): Cqrs {
  const logger = options.logger ?? console;
  const behavior = behaviorResolver(
    options.behaviors ?? [],
    options.globalBehaviors,
    logger,
  );
  const handlers = new Handlers();
  const unhandledExceptionBus = new UnhandledExceptionBus();
  const eventBus = new EventBus(handlers.events, unhandledExceptionBus, {
    rethrowUnhandled: options.rethrowUnhandled,
    logger,
  });
  return {
    commandBus: new CommandBus(handlers.commands),
    queryBus: new QueryBus(handlers.queries),
    eventBus,
    unhandledExceptionBus,
    register(...instances) {
      const entries = instances.map((instance) => {
        const type = instance.constructor as Constructor;
        if (!commandOf(type) && !queryOf(type) && !eventsOf(type)) {
          throw new TypeError(
            `${type.name} has no @CommandHandler, @QueryHandler or @EventsHandler decorator.`,
          );
        }
        return { type, resolve: () => instance };
      });
      registerHandlers(handlers, entries, behavior, options, logger);
    },
    close: () => eventBus.drain(),
  };
}
