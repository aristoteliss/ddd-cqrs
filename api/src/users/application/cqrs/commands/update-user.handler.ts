/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  CommandBaseHandler,
  IWriteSideAggregateRepository,
} from '@cqrs-ddd/core/application';
import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import { CommandHandler, EventBus } from '@cqrs-ddd/cqrs';
import { type IPipelineContext, UsePipeline } from '@cqrs-ddd/pipeline';
import { AUDIT_SEVERITY, audit } from '@cqrs-ddd/pipeline-audit';
import { CaslAuthorizer, requires } from '@cqrs-ddd/pipeline-casl';
import {
  APP_ACTIONS,
  APP_SUBJECTS,
  AUDIT_ACTIONS,
} from '../../../../common/constants/index.js';
import type { User } from '../../../domain/models/user.entity.js';
import { UpdateUserCommand } from './update-user.command.js';

@CommandHandler(UpdateUserCommand)
@UsePipeline(
  requires({ action: APP_ACTIONS.UPDATE, subject: APP_SUBJECTS.USER }),
  audit({
    action: AUDIT_ACTIONS.USER_UPDATE,
    severity: AUDIT_SEVERITY.MEDIUM,
    metadata: (ctx: IPipelineContext) => {
      const cmd = ctx.request as UpdateUserCommand | undefined;
      return cmd?.id ? { targetUserId: cmd.id } : {};
    },
  }),
)
export class UpdateUserHandler extends CommandBaseHandler<
  UpdateUserCommand,
  User
> {
  constructor(
    private readonly commandRepository: IWriteSideAggregateRepository<User>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: UpdateUserCommand): Promise<User> {
    const { id, username, department } = command;
    const user = await this.commandRepository.findById(id);
    if (!user) {
      throw new EntityNotFoundException('User', id);
    }

    this.authorizer.authorize(
      'update',
      user,
      command.getUpdateFields(UpdateUserCommand.updatableFields),
    );
    user.update({ username, department });
    await this.commandRepository.save(user);
    return user;
  }
}
