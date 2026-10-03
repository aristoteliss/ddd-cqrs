/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IEvent, UnhandledExceptionInfo } from './interfaces.js';

/** Ends a subscription to the {@link UnhandledExceptionBus}. */
export interface Subscription {
  unsubscribe(): void;
}

/**
 * Receives the failures of event handlers, which nothing awaits. `EventBus` publishes
 * each one here before it logs it.
 *
 * @example
 * ```ts
 * const subscription = app.get(UnhandledExceptionBus).subscribe(({ cause, exception }) =>
 *   alerts.notify(cause.constructor.name, exception),
 * );
 * subscription.unsubscribe();
 * ```
 */
export class UnhandledExceptionBus<Cause = IEvent> {
  private readonly listeners = new Set<
    (info: UnhandledExceptionInfo<Cause>) => void
  >();

  /**
   * Calls `next` with every failure published from now on, until the subscription ends.
   * A listener that throws does not stop the others; its error is thrown on a later
   * tick, as an uncaught exception.
   *
   * @example
   * ```ts
   * const subscription = unhandledExceptionBus.subscribe((info) => logger.error(info.exception));
   * ```
   */
  subscribe(next: (info: UnhandledExceptionInfo<Cause>) => void): Subscription {
    const listener = (info: UnhandledExceptionInfo<Cause>) => next(info);
    this.listeners.add(listener);
    return { unsubscribe: () => this.listeners.delete(listener) };
  }

  /**
   * Delivers a failure to every current subscriber, synchronously.
   *
   * @example
   * ```ts
   * unhandledExceptionBus.publish({ cause: event, exception: error });
   * ```
   */
  publish(info: UnhandledExceptionInfo<Cause>): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(info);
      } catch (error) {
        raise(error);
      }
    }
  }
}

/** Throws `error` on a later tick, where nothing can catch it. */
export function raise(error: unknown): void {
  setTimeout(() => {
    throw error;
  });
}
