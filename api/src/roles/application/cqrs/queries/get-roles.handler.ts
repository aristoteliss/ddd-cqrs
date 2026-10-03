/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IQueryRepository } from '@cqrs-ddd/core/application';
import { type IQueryHandler, QueryHandler, UsePipeline } from '@cqrs-ddd/cqrs';
import { CaslAuthorizer, requires } from '@cqrs-ddd/pipeline-casl';
import {
  APP_ACTIONS,
  APP_SUBJECTS,
} from '../../../../common/constants/index.js';
import type { Role } from '../../../domain/models/role.entity.js';
import { projectRoleRead, type RoleReadModel } from '../../role-read-model.js';
import { GetRolesQuery } from './get-roles.query.js';

@QueryHandler(GetRolesQuery)
@UsePipeline(requires({ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.ROLE }))
export class GetRolesHandler
  implements IQueryHandler<GetRolesQuery, RoleReadModel[]>
{
  constructor(
    private readonly queryRepository: IQueryRepository<GetRolesQuery, Role[]>,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(query: GetRolesQuery): Promise<RoleReadModel[]> {
    const roles = await this.queryRepository.find(query);
    return roles
      .filter((role) => this.authorizer.can(APP_ACTIONS.READ, role))
      .map((role) => projectRoleRead(this.authorizer, role));
  }
}
