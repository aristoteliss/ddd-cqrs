/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  CommandBaseHandler,
  IWriteSideAggregateRepository,
} from '@cqrs-ddd/core/application';
import {
  EntityNotFoundException,
  isTransientOperationError,
} from '@cqrs-ddd/core/domain';
import { CommandHandler, EventBus, UsePipeline } from '@cqrs-ddd/cqrs';
import { type IPipelineContext } from '@cqrs-ddd/pipeline';
import { AUDIT_SEVERITY, audit } from '@cqrs-ddd/pipeline-audit';
import { CaslAuthorizer, requires } from '@cqrs-ddd/pipeline-casl';
import { resilience } from '@cqrs-ddd/pipeline-resilience';
import {
  APP_ACTIONS,
  APP_SUBJECTS,
  AUDIT_ACTIONS,
} from '../../../../common/constants/index.js';
import type { User } from '../../../domain/models/user.entity.js';
import { DeleteUserCommand } from './delete-user.command.js';

@CommandHandler(DeleteUserCommand)
@UsePipeline(
  requires({ action: APP_ACTIONS.DELETE, subject: APP_SUBJECTS.USER }),
  audit({
    action: AUDIT_ACTIONS.USER_DELETE,
    severity: AUDIT_SEVERITY.HIGH,
    metadata: (ctx: IPipelineContext) => {
      const cmd = ctx.request as DeleteUserCommand | undefined;
      return cmd?.id ? { targetUserId: cmd.id } : {};
    },
  }),
  resilience({
    handle: isTransientOperationError,
    retry: {
      maxAttempts: 3,
      replaySafe: true,
      backoff: {
        type: 'exponential',
        initialDelay: 25,
        maxDelay: 100,
      },
    },
  }),
)
export class DeleteUserHandler extends CommandBaseHandler<
  DeleteUserCommand,
  User
> {
  constructor(
    private readonly commandRepository: IWriteSideAggregateRepository<User>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: DeleteUserCommand): Promise<User> {
    const user = await this.commandRepository.findById(command.id);
    if (!user) {
      throw new EntityNotFoundException('User', command.id);
    }
    this.authorizer.authorize('delete', user);
    user.delete();
    await this.commandRepository.save(user);
    return user;
  }
}
