/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type {
  CapabilityString,
  Capability as CaslCapability,
} from '@cqrs-ddd/pipeline-casl';
import { capabilityFromRow } from '../../../src/auths/persistence/helpers/capability-row.mapper.js';
import { RoleCapability } from '../../../src/persistence/entities/role-capability.entity.js';
import type { MikroOrmStore } from '../../../src/persistence/mikro-orm.store.js';
import { Capability } from '../../../src/roles/domain/models/capability.entity.js';
import { Role } from '../../../src/roles/domain/models/role.entity.js';
import { GetRolesCapabilitiesQuery } from './get-roles-capabilities.query.js';

/** Role capabilities read straight from the assignment tables. */
export interface RoleDefinition {
  name: string;
  capabilities: (CaslCapability | CapabilityString)[];
}

export class GetRolesCapabilitiesQueryRepository {
  constructor(private readonly store: MikroOrmStore) {}

  async getRoles(names?: string[]): Promise<RoleDefinition[]> {
    return this.find(new GetRolesCapabilitiesQuery({ names }));
  }

  async find(query: GetRolesCapabilitiesQuery): Promise<RoleDefinition[]> {
    const { names } = query;
    if (names?.length === 0) return [];

    const em = this.store.em;
    const roles = await em.find(
      Role,
      names === undefined ? {} : { name: { $in: names } },
    );

    if (roles.length === 0) return [];

    const links = await em.find(RoleCapability, {
      roleId: { $in: roles.map((role) => role.id) },
    });
    const capabilityIds = [...new Set(links.map((link) => link.capabilityId))];
    const capabilities =
      capabilityIds.length === 0
        ? []
        : await em.find(Capability, {
            id: { $in: capabilityIds },
          } as never);
    const capabilityById = new Map(
      capabilities.map((capability) => [capability.id, capability]),
    );

    const capsByRole = new Map<string, RoleDefinition['capabilities']>();
    for (const link of links) {
      const roleId = link.roleId;
      const capability = capabilityById.get(link.capabilityId);
      if (!capability) continue;
      if (!capsByRole.has(roleId)) capsByRole.set(roleId, []);

      // biome-ignore lint/style/noNonNullAssertion: role bucket exists after has()/set() guard
      capsByRole.get(roleId)!.push(capabilityFromRow(capability));
    }

    return roles.map((role) => ({
      name: role.name,
      capabilities: capsByRole.get(role.id) ?? [],
    }));
  }
}
