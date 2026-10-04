/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  BaseCommand,
  CommandBaseHandler,
  type IDomainEventPublisher,
} from '@cqrs-ddd/core/application';
import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import { audit } from '@cqrs-ddd/pipeline-audit';
import { pipeline } from './pipeline.js';
import type { User } from './user.js';

export class RenameUserCommand extends BaseCommand {
  constructor(
    readonly userId: string,
    readonly name: string,
  ) {
    super();
  }
}

/**
 * Renames a user. The handler overrides `execute()` only to decorate it, so the whole
 * of it, the publication of the events included, runs inside the pipeline: the audit
 * record sees the command, and a failed publication fails it.
 *
 * @example
 * ```ts
 * await new RenameUserHandler(users, eventBus).execute(new RenameUserCommand('u-1', 'Anna'));
 * ```
 */
export class RenameUserHandler extends CommandBaseHandler<
  RenameUserCommand,
  User
> {
  constructor(
    private readonly users: Map<string, User>,
    eventBus: IDomainEventPublisher,
  ) {
    super(eventBus);
  }

  async handle(command: RenameUserCommand): Promise<User> {
    const user = this.users.get(command.userId);
    if (!user) throw new EntityNotFoundException('User', command.userId);
    return user.rename(command.name);
  }

  @pipeline.wrap(audit({ action: 'user.rename', severity: 'medium' }))
  override async execute(command: RenameUserCommand): Promise<User> {
    return super.execute(command);
  }
}
