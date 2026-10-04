/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  CommandBaseHandler,
  IWriteSideAggregateRepository,
} from '@cqrs-ddd/core/application';
import {
  EntityNotFoundException,
  isTransientOperationError,
} from '@cqrs-ddd/core/domain';
import { CommandHandler, EventBus } from '@cqrs-ddd/cqrs';
import { type IPipelineContext, UsePipeline } from '@cqrs-ddd/pipeline';
import { AUDIT_SEVERITY, audit } from '@cqrs-ddd/pipeline-audit';
import { CaslAuthorizer, requires } from '@cqrs-ddd/pipeline-casl';
import { resilience } from '@cqrs-ddd/pipeline-resilience';
import {
  APP_ACTIONS,
  APP_SUBJECTS,
  AUDIT_ACTIONS,
} from '../../../../common/constants/index.js';
import type { Role } from '../../../domain/models/role.entity.js';
import { DeleteRoleCommand } from './delete-role.command.js';

@CommandHandler(DeleteRoleCommand)
@UsePipeline(
  requires({ action: APP_ACTIONS.DELETE, subject: APP_SUBJECTS.ROLE }),
  audit({
    action: AUDIT_ACTIONS.ROLE_DELETE,
    severity: AUDIT_SEVERITY.HIGH,
    metadata: (ctx: IPipelineContext) => {
      const cmd = ctx.request as DeleteRoleCommand | undefined;
      return cmd?.id ? { targetRoleId: cmd.id } : {};
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
export class DeleteRoleHandler extends CommandBaseHandler<
  DeleteRoleCommand,
  Role
> {
  constructor(
    private readonly commandRepository: IWriteSideAggregateRepository<Role>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: DeleteRoleCommand): Promise<Role> {
    const role = await this.commandRepository.findById(command.id);
    if (!role) {
      throw new EntityNotFoundException('Role', command.id);
    }
    this.authorizer.authorize('delete', role);
    role.delete();
    await this.commandRepository.save(role);
    return role;
  }
}
