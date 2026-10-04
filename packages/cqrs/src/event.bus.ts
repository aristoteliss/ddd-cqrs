/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineLogger } from '@cqrs-ddd/pipeline';
import type { RequestType } from './decorators.js';
import { type Dispatch, nearest } from './dispatch.js';
import type { IEvent } from './interfaces.js';
import {
  raise,
  type UnhandledExceptionBus,
} from './unhandled-exception.bus.js';

/** One handler of an event class: its name, for logs, and what runs it. */
export interface EventSubscriber {
  readonly name: string;
  readonly run: Dispatch;
}

/** How the {@link EventBus} treats a failed handler. */
export interface EventBusOptions {
  /**
   * Throw a failure as an uncaught exception instead of publishing it on the
   * `UnhandledExceptionBus` and logging it.
   * @default false
   */
  readonly rethrowUnhandled?: boolean;
  /** Logs each failure at `error`. @default console */
  readonly logger?: PipelineLogger;
}

/**
 * Starts every handler of an event, each through its own pipeline, and returns without
 * awaiting them. `createCqrs()` builds it; it satisfies `IDomainEventPublisher` of
 * `@cqrs-ddd/core`, so `CommandBaseHandler` takes it as its event publisher.
 *
 * @example
 * ```ts
 * cqrs.eventBus.publish(new UserCreatedEvent(user.id));
 * ```
 */
export class EventBus<E extends IEvent = IEvent> {
  private readonly running = new Set<Promise<void>>();

  /**
   * @param handlers - Maps each event class to its handlers. The bus reads it at every
   *   call, so it can be filled after the bus is created, as handlers that inject the bus
   *   require.
   * @param unhandled - Receives the failures of handlers.
   */
  constructor(
    private readonly handlers: ReadonlyMap<
      RequestType,
      readonly EventSubscriber[]
    >,
    private readonly unhandled: UnhandledExceptionBus,
    private readonly options: EventBusOptions = {},
  ) {}

  /**
   * Starts the handlers of the event's class, or of its nearest parent class that has
   * any; their synchronous part runs before `publish` returns. An event without handlers
   * is dropped. A failure goes to the `UnhandledExceptionBus` and the logger, never to
   * the caller.
   *
   * @example
   * ```ts
   * eventBus.publish(new UserCreatedEvent(user.id));
   * ```
   */
  publish<T extends E>(event: T): void {
    for (const { name, run } of nearest(this.handlers, event.constructor) ??
      []) {
      const settled: Promise<void> = run(event)
        .then(
          () => undefined,
          (exception) => this.fail(name, event, exception),
        )
        .finally(() => this.running.delete(settled));
      this.running.add(settled);
    }
  }

  /**
   * Publishes each event in order, as {@link publish} does.
   *
   * @example
   * ```ts
   * eventBus.publishAll(order.getUncommittedEvents());
   * ```
   */
  publishAll<T extends E>(events: readonly T[]): void {
    for (const event of events) this.publish(event);
  }

  /**
   * Resolves once every handler started so far has settled, including handlers those
   * handlers start meanwhile. `app.close()` calls it, so a shutdown or a test ends
   * after the work it caused.
   *
   * @example
   * ```ts
   * eventBus.publish(new UserCreatedEvent(user.id));
   * await eventBus.drain();
   * ```
   */
  async drain(): Promise<void> {
    while (this.running.size > 0) await Promise.all(this.running);
  }

  private fail(name: string, event: E, exception: unknown): void {
    if (this.options.rethrowUnhandled) {
      raise(exception);
      return;
    }
    this.unhandled.publish({ cause: event, exception });
    (this.options.logger ?? console).error(
      `"${name}" has thrown an unhandled exception.`,
      exception,
    );
  }
}
