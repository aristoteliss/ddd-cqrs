/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IQueryRepository } from '@cqrs-ddd/core/application';
import { type IQueryHandler, QueryHandler } from '@cqrs-ddd/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { type Capability, requires } from '@cqrs-ddd/pipeline-casl';
import {
  APP_ACTIONS,
  APP_SUBJECTS,
} from '../../../../common/constants/index.js';
import { GetUserPermissionRulesQuery } from './get-user-permission-rules.query.js';

@QueryHandler(GetUserPermissionRulesQuery)
@UsePipeline(requires({ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER }))
export class GetUserPermissionRulesHandler
  implements IQueryHandler<GetUserPermissionRulesQuery, Capability[]>
{
  constructor(
    private readonly queryRepository: IQueryRepository<
      GetUserPermissionRulesQuery,
      Capability[]
    >,
  ) {}

  async execute(query: GetUserPermissionRulesQuery): Promise<Capability[]> {
    return this.queryRepository.find(query);
  }
}
