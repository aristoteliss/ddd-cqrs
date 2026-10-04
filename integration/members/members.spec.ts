/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import type {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@cqrs-ddd/pipeline';
import { afterEach, describe, expect, it } from 'vitest';
import { Member } from './member.js';
import {
  GetMemberQuery,
  RenameMemberCommand,
  startMembers,
} from './members.js';

const trace: string[] = [];
const correlations = new Map<string, string>();

/** Records where each handler starts and ends, and the correlation id it ran with. */
class Tracing implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate) {
    correlations.set(context.requestName, context.correlationId);
    trace.push(`start ${context.requestKind} ${context.handlerName}`);
    const result = await next();
    trace.push(`end ${context.handlerName}`);
    return result;
  }
}

const club = () => new Map([['m-1', new Member('m-1', 'Ann')]]);
const start = () =>
  startMembers(club(), { globalBehaviors: { before: [Tracing] } });

afterEach(() => {
  trace.length = 0;
  correlations.clear();
});

describe('the domain on the @cqrs-ddd/cqrs buses', () => {
  it("publishes a command's events through the EventBus, inside its correlation", async () => {
    const { cqrs, announcements } = start();
    const member = await cqrs.commandBus.execute<RenameMemberCommand, Member>(
      new RenameMemberCommand('m-1', 'Anna'),
    );
    await cqrs.close();

    expect(member.getUncommittedEvents()).toEqual([]);
    expect(announcements.sent).toEqual(['m-1 is now Anna']);
    expect(trace.slice(0, 2)).toEqual([
      'start command RenameMemberHandler',
      'start event AnnounceRename',
    ]);
    expect(trace.slice(2).sort()).toEqual([
      'end AnnounceRename',
      'end RenameMemberHandler',
    ]);
    expect(correlations.get('MemberRenamedEvent')).toBe(
      correlations.get('RenameMemberCommand'),
    );
  });

  it('runs a query through its handler and pipeline', async () => {
    const { cqrs } = start();
    await expect(
      cqrs.queryBus.execute(new GetMemberQuery('m-1')),
    ).resolves.toEqual({ id: 'm-1', name: 'Ann' });
    await expect(
      cqrs.queryBus.execute(new GetMemberQuery('m-9')),
    ).resolves.toBeNull();
    expect(trace.slice(0, 2)).toEqual([
      'start query GetMemberHandler',
      'end GetMemberHandler',
    ]);
    await cqrs.close();
  });

  it('rejects a command for an unknown member and announces nothing', async () => {
    const { cqrs, announcements } = startMembers(club());
    await expect(
      cqrs.commandBus.execute(new RenameMemberCommand('m-9', 'Bob')),
    ).rejects.toBeInstanceOf(EntityNotFoundException);
    await cqrs.close();
    expect(announcements.sent).toEqual([]);
  });
});
