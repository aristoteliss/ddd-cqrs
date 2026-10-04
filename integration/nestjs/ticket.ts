/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  AggregateRoot,
  DomainEvent,
  DomainException,
} from '@cqrs-ddd/core/domain';

export class TicketOpenedEvent extends DomainEvent {
  constructor(
    readonly ticketId: string,
    readonly title: string,
  ) {
    super();
  }
}

export class TicketClosedEvent extends DomainEvent {
  constructor(readonly ticketId: string) {
    super();
  }
}

export class TicketAlreadyClosedError extends DomainException {
  constructor(ticketId: string) {
    super(`Ticket ${ticketId} is already closed`);
  }
}

/**
 * A support ticket: opened with a title, closed once, each step through the event
 * it applies.
 *
 * @example
 * ```ts
 * const ticket = Ticket.open('t-1', 'Printer jam');
 * ticket.close().status; // 'closed'
 * ```
 */
export class Ticket extends AggregateRoot {
  #title = '';
  #status: 'open' | 'closed' = 'open';

  private constructor(readonly id: string) {
    super();
  }

  static open(id: string, title: string): Ticket {
    const ticket = new Ticket(id);
    ticket.apply(new TicketOpenedEvent(id, title));
    return ticket;
  }

  get title(): string {
    return this.#title;
  }

  get status(): 'open' | 'closed' {
    return this.#status;
  }

  /** @throws TicketAlreadyClosedError when the ticket is closed. */
  close(): this {
    if (this.#status === 'closed') throw new TicketAlreadyClosedError(this.id);
    this.apply(new TicketClosedEvent(this.id));
    return this;
  }

  protected onTicketOpenedEvent(event: TicketOpenedEvent): void {
    this.#title = event.title;
  }

  protected onTicketClosedEvent(): void {
    this.#status = 'closed';
  }
}
