/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Constructor } from '@cqrs-ddd/pipeline';
import type { EventBus } from './event.bus.js';
import type { IEvent } from './interfaces.js';

/**
 * Connects aggregates to the `EventBus`: a merged aggregate's `publish` and `publishAll`,
 * and so its `commit()`, hand events to the bus. Handlers receive it from
 * `CqrsFactory.create()` like any provider.
 *
 * @example
 * ```ts
 * const order = eventPublisher.mergeObjectContext(Order.place(id));
 * order.commit();
 * ```
 */
export class EventPublisher<E extends IEvent = IEvent> {
  constructor(private readonly eventBus: EventBus<E>) {}

  /**
   * Returns a subclass whose instances publish through the bus.
   *
   * @example
   * ```ts
   * const Order = eventPublisher.mergeClassContext(OrderAggregate);
   * const order = new Order(id);
   * order.commit();
   * ```
   */
  mergeClassContext<T extends Constructor<object>>(type: T): T {
    const eventBus = this.eventBus;
    return class extends type {
      publish(event: E) {
        eventBus.publish(event);
      }
      publishAll(events: readonly E[]) {
        eventBus.publishAll(events);
      }
    };
  }

  /**
   * Sets the object's `publish` and `publishAll` to publish through the bus, and returns
   * the object.
   *
   * @example
   * ```ts
   * const user = eventPublisher.mergeObjectContext(await users.load(id));
   * user.rename(name);
   * user.commit();
   * ```
   */
  mergeObjectContext<T extends object>(object: T): T {
    return Object.assign(object, {
      publish: (event: E) => this.eventBus.publish(event),
      publishAll: (events: readonly E[]) => this.eventBus.publishAll(events),
    });
  }
}
