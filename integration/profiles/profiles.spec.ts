/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IDomainEventPublisher } from '@cqrs-ddd/core/application';
import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import { pipelineStore } from '@cqrs-ddd/pipeline';
import { afterEach, describe, expect, it } from 'vitest';
import { auditTrail } from './pipeline.js';
import { RenameUserCommand, RenameUserHandler } from './rename-user.js';
import { User, UserRenamedEvent } from './user.js';

/** A publisher that records each event and whether it ran inside the pipeline. */
function recorder() {
  const published: { event: unknown; inPipeline: boolean }[] = [];
  const eventBus: IDomainEventPublisher = {
    publishAll: (events) => {
      for (const event of events) {
        published.push({
          event,
          inPipeline: pipelineStore.getStore() !== undefined,
        });
      }
    },
  };
  return { published, eventBus };
}

afterEach(() => {
  auditTrail.length = 0;
});

describe('a domain handler wrapped by a pipeline, without buses', () => {
  it('audits the command and publishes its event inside the pipeline', async () => {
    const users = new Map([['u-1', new User('u-1', 'Ann')]]);
    const { published, eventBus } = recorder();

    const user = await new RenameUserHandler(users, eventBus).execute(
      new RenameUserCommand('u-1', 'Anna'),
    );

    expect(user.name).toBe('Anna');
    expect(user.getUncommittedEvents()).toEqual([]);
    expect(published).toEqual([
      { event: expect.any(UserRenamedEvent), inPipeline: true },
    ]);
    expect(auditTrail).toEqual([
      expect.objectContaining({
        action: 'user.rename',
        outcome: 'success',
        requestKind: 'command',
        requestName: 'RenameUserCommand',
        handlerName: 'RenameUserHandler.execute',
      }),
    ]);
  });

  it('publishes nothing when the name does not change', async () => {
    const users = new Map([['u-1', new User('u-1', 'Ann')]]);
    const { published, eventBus } = recorder();

    await new RenameUserHandler(users, eventBus).execute(
      new RenameUserCommand('u-1', 'Ann'),
    );

    expect(published).toEqual([]);
  });

  it('audits a failed command and publishes nothing', async () => {
    const { published, eventBus } = recorder();

    await expect(
      new RenameUserHandler(new Map(), eventBus).execute(
        new RenameUserCommand('u-9', 'Anna'),
      ),
    ).rejects.toBeInstanceOf(EntityNotFoundException);
    expect(published).toEqual([]);
    expect(auditTrail.map((record) => record.outcome)).toEqual(['failure']);
  });
});
