/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IQueryRepository } from '@cqrs-ddd/core/application';
import { type IQueryHandler, QueryHandler } from '@cqrs-ddd/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { CaslAuthorizer, requires } from '@cqrs-ddd/pipeline-casl';
import {
  APP_ACTIONS,
  APP_SUBJECTS,
} from '../../../../common/constants/index.js';
import type { User } from '../../../domain/models/user.entity.js';
import { projectUserRead, type UserReadModel } from '../../user-read-model.js';
import { GetUserQuery } from './get-user.query.js';

@QueryHandler(GetUserQuery)
@UsePipeline(requires({ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER }))
export class GetUserHandler
  implements IQueryHandler<GetUserQuery, UserReadModel | null>
{
  constructor(
    private readonly queryRepository: IQueryRepository<
      GetUserQuery,
      User | null
    >,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(query: GetUserQuery): Promise<UserReadModel | null> {
    const user = await this.queryRepository.find(this.toRefreshed(query));

    return user ? projectUserRead(this.authorizer, user) : null;
  }

  private toRefreshed(query: GetUserQuery): GetUserQuery {
    const needsRefresh =
      this.authorizer.dependsOnEntity(APP_ACTIONS.READ, APP_SUBJECTS.USER) &&
      !query.refresh;
    if (!needsRefresh) return query;

    const { userId, email, department, hydrate, sessionPrincipal } = query;

    return new GetUserQuery(
      { userId, email, department },
      { hydrate, refresh: true },
      sessionPrincipal,
    );
  }
}
