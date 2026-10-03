/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IQueryRepository } from '@cqrs-ddd/core/application';
import { type IQueryHandler, QueryHandler, UsePipeline } from '@cqrs-ddd/cqrs';
import { CaslAuthorizer, requires } from '@cqrs-ddd/pipeline-casl';
import {
  APP_ACTIONS,
  APP_SUBJECTS,
} from '../../../../common/constants/index.js';
import type { User } from '../../../domain/models/user.entity.js';
import { projectUserRead, type UserReadModel } from '../../user-read-model.js';
import { GetUsersQuery } from './get-users.query.js';

@QueryHandler(GetUsersQuery)
@UsePipeline(requires({ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER }))
export class GetUsersHandler
  implements IQueryHandler<GetUsersQuery, UserReadModel[]>
{
  constructor(
    private readonly queryRepository: IQueryRepository<GetUsersQuery, User[]>,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(query: GetUsersQuery): Promise<UserReadModel[]> {
    const users = await this.queryRepository.find(query);
    return users
      .filter((user) => this.authorizer.can(APP_ACTIONS.READ, user))
      .map((user) => projectUserRead(this.authorizer, user));
  }
}
