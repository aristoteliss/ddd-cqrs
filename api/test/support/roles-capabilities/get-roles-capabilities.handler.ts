/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IQueryRepository } from '@cqrs-ddd/core/application';
import { type IQueryHandler, QueryHandler } from '@cqrs-ddd/cqrs';
import { GetRolesCapabilitiesQuery } from './get-roles-capabilities.query.js';
import type { RoleDefinition } from './get-roles-capabilities.query-repository.js';

@QueryHandler(GetRolesCapabilitiesQuery)
export class GetRolesCapabilitiesHandler
  implements IQueryHandler<GetRolesCapabilitiesQuery, RoleDefinition[]>
{
  constructor(
    private readonly queryRepository: IQueryRepository<
      GetRolesCapabilitiesQuery,
      RoleDefinition[]
    >,
  ) {}

  async execute(query: GetRolesCapabilitiesQuery): Promise<RoleDefinition[]> {
    return await this.queryRepository.find(query);
  }
}
