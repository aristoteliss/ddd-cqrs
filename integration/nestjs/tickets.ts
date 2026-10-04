/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { randomUUID } from 'node:crypto';
import {
  BaseCommand,
  BaseQuery,
  CommandBaseHandler,
} from '@cqrs-ddd/core/application';
import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { requires } from '@cqrs-ddd/pipeline-casl';
import { rateLimit } from '@cqrs-ddd/pipeline-rate-limit';
import { createCommand } from '@cqrs-ddd/pipeline-zod';
import { Inject, Injectable } from '@nestjs/common';
import {
  CommandHandler,
  EventBus,
  EventsHandler,
  QueryHandler,
} from '@nestjs/cqrs';
import { z } from 'zod';
import { Ticket, TicketOpenedEvent } from './ticket.js';

export class OpenTicketCommand extends createCommand(
  z.object({ title: z.string().trim().min(3) }),
  BaseCommand,
) {}

export class CloseTicketCommand extends BaseCommand {
  constructor(readonly ticketId: string) {
    super();
  }
}

export class GetTicketQuery extends BaseQuery {
  constructor(readonly ticketId: string) {
    super();
  }
}

/** A ticket as the HTTP answers show it. */
export interface TicketView {
  readonly id: string;
  readonly title: string;
  readonly status: 'open' | 'closed';
}

/**
 * The view of a ticket.
 *
 * @example
 * ```ts
 * view(Ticket.open('t-1', 'Printer jam')); // { id: 't-1', title: 'Printer jam', status: 'open' }
 * ```
 */
export function view(ticket: Ticket): TicketView {
  return { id: ticket.id, title: ticket.title, status: ticket.status };
}

/** The tickets of the desk, in memory. */
@Injectable()
export class Tickets extends Map<string, Ticket> {}

/** Opens a ticket; every caller shares three openings a minute. */
@CommandHandler(OpenTicketCommand)
@UsePipeline(rateLimit({ keyFactory: (context) => context.requestName }))
export class OpenTicketHandler extends CommandBaseHandler<
  OpenTicketCommand,
  Ticket
> {
  constructor(
    @Inject(Tickets) private readonly tickets: Tickets,
    @Inject(EventBus) eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: OpenTicketCommand): Promise<Ticket> {
    const ticket = Ticket.open(randomUUID(), command.title);
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }
}

/** Closes a ticket; only a caller who may close tickets gets here. */
@CommandHandler(CloseTicketCommand)
@UsePipeline(requires({ action: 'close', subject: 'Ticket' }))
export class CloseTicketHandler extends CommandBaseHandler<
  CloseTicketCommand,
  Ticket
> {
  constructor(
    @Inject(Tickets) private readonly tickets: Tickets,
    @Inject(EventBus) eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: CloseTicketCommand): Promise<Ticket> {
    const ticket = this.tickets.get(command.ticketId);
    if (!ticket) throw new EntityNotFoundException('Ticket', command.ticketId);
    return ticket.close();
  }
}

@QueryHandler(GetTicketQuery)
export class GetTicketHandler {
  constructor(@Inject(Tickets) private readonly tickets: Tickets) {}

  async execute(query: GetTicketQuery): Promise<TicketView> {
    const ticket = this.tickets.get(query.ticketId);
    if (!ticket) throw new EntityNotFoundException('Ticket', query.ticketId);
    return view(ticket);
  }
}

/** Tells the desk about each new ticket; it keeps what it sent. */
@EventsHandler(TicketOpenedEvent)
export class NotifyDesk {
  readonly sent: string[] = [];

  async handle(event: TicketOpenedEvent) {
    this.sent.push(`New ticket: ${event.title}`);
  }
}
