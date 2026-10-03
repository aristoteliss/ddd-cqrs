/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  CommandBaseHandler,
  IWriteSideAggregateRepository,
} from '@cqrs-ddd/core/application';
import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import { CommandHandler, EventBus, UsePipeline } from '@cqrs-ddd/cqrs';
import { type IPipelineContext, logging } from '@cqrs-ddd/pipeline';
import { AUDIT_SEVERITY, audit } from '@cqrs-ddd/pipeline-audit';
import { CaslAuthorizer, requires } from '@cqrs-ddd/pipeline-casl';
import {
  APP_ACTIONS,
  APP_SUBJECTS,
  AUDIT_ACTIONS,
} from '../../../../common/constants/index.js';
import { UniqueRoleNameException } from '../../../domain/models/errors/role-name.exception.js';
import type { Role } from '../../../domain/models/role.entity.js';
import { UpdateRoleCommand } from './update-role.command.js';

@CommandHandler(UpdateRoleCommand)
@UsePipeline(
  logging({
    mapLogLevel: new Map([[UniqueRoleNameException, 'warn']]),
  }),
  requires({ action: APP_ACTIONS.UPDATE, subject: APP_SUBJECTS.ROLE }),
  audit({
    action: AUDIT_ACTIONS.ROLE_UPDATE,
    severity: AUDIT_SEVERITY.MEDIUM,
    metadata: (ctx: IPipelineContext) => {
      const cmd = ctx.request as UpdateRoleCommand | undefined;
      return cmd?.id ? { targetRoleId: cmd.id } : {};
    },
  }),
)
export class UpdateRoleHandler extends CommandBaseHandler<
  UpdateRoleCommand,
  Role
> {
  constructor(
    private readonly commandRepository: IWriteSideAggregateRepository<Role>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: UpdateRoleCommand): Promise<Role> {
    const role = await this.commandRepository.findById(command.id);
    if (!role) {
      throw new EntityNotFoundException('Role', command.id);
    }
    this.authorizer.authorize(
      'update',
      role,
      command.getUpdateFields(UpdateRoleCommand.updatableFields),
    );
    role.rename(command.name);
    await this.commandRepository.save(role);
    return role;
  }
}
