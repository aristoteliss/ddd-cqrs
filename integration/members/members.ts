/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  BaseCommand,
  BaseQuery,
  CommandBaseHandler,
} from '@cqrs-ddd/core/application';
import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import {
  CommandHandler,
  type CqrsOptions,
  createCqrs,
  type EventBus,
  EventsHandler,
  QueryHandler,
} from '@cqrs-ddd/cqrs';
import { type Member, MemberRenamedEvent } from './member.js';

export class RenameMemberCommand extends BaseCommand {
  constructor(
    readonly memberId: string,
    readonly name: string,
  ) {
    super();
  }
}

export class GetMemberQuery extends BaseQuery {
  constructor(readonly memberId: string) {
    super();
  }
}

/** Renames a member; `CommandBaseHandler` publishes its event on the `EventBus`. */
@CommandHandler(RenameMemberCommand)
export class RenameMemberHandler extends CommandBaseHandler<
  RenameMemberCommand,
  Member
> {
  constructor(
    private readonly members: Map<string, Member>,
    eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: RenameMemberCommand): Promise<Member> {
    const member = this.members.get(command.memberId);
    if (!member) throw new EntityNotFoundException('Member', command.memberId);
    return member.rename(command.name);
  }
}

/** Reads a member's name, or `null`. */
@QueryHandler(GetMemberQuery)
export class GetMemberHandler {
  constructor(private readonly members: Map<string, Member>) {}

  async execute(query: GetMemberQuery) {
    const member = this.members.get(query.memberId);
    return member ? { id: member.id, name: member.name } : null;
  }
}

/** Tells the club about a new name; it keeps what it sent. */
@EventsHandler(MemberRenamedEvent)
export class AnnounceRename {
  readonly sent: string[] = [];

  async handle(event: MemberRenamedEvent) {
    this.sent.push(`${event.memberId} is now ${event.name}`);
  }
}

/**
 * Builds the members application: the buses of `createCqrs()` and its three handlers,
 * each built with `new`. `options` add behaviors around every handler.
 *
 * @example
 * ```ts
 * const { cqrs } = startMembers(new Map([['m-1', new Member('m-1', 'Ann')]]));
 * await cqrs.commandBus.execute(new RenameMemberCommand('m-1', 'Anna'));
 * await cqrs.close();
 * ```
 */
export function startMembers(
  members: Map<string, Member>,
  options: CqrsOptions = {},
) {
  const cqrs = createCqrs({ bootstrapLogLevel: 'none', ...options });
  const announcements = new AnnounceRename();
  cqrs.register(
    new RenameMemberHandler(members, cqrs.eventBus),
    new GetMemberHandler(members),
    announcements,
  );
  return { cqrs, announcements };
}
