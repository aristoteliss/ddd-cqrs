/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type {
  CapabilityString,
  Capability as CaslCapability,
} from '@cqrs-ddd/pipeline-casl';
import type { EntityManager } from '@mikro-orm/core';
import { capabilityFromRow } from '../../src/auths/persistence/helpers/capability-row.mapper.js';
import { RoleCapability } from '../../src/persistence/entities/role-capability.entity.js';
import { Capability } from '../../src/roles/domain/models/capability.entity.js';
import { Role } from '../../src/roles/domain/models/role.entity.js';

/** A role and the capabilities assigned to it. */
export interface RoleDefinition {
  name: string;
  capabilities: (CaslCapability | CapabilityString)[];
}

/**
 * The roles named, or every role, with their capabilities read straight from the
 * assignment tables: what a spec compares the materialized permission rules with.
 *
 * @example
 * ```ts
 * const [admin] = await roleCapabilities(orm.em.fork(), ['admin']);
 * ```
 */
export async function roleCapabilities(
  em: EntityManager,
  names?: string[],
): Promise<RoleDefinition[]> {
  if (names?.length === 0) return [];
  const roles = await em.find(
    Role,
    names === undefined ? {} : { name: { $in: names } },
  );
  if (roles.length === 0) return [];

  const links = await em.find(RoleCapability, {
    roleId: { $in: roles.map((role) => role.id) },
  });
  const ids = [...new Set(links.map((link) => link.capabilityId))];
  const capabilities =
    ids.length === 0
      ? []
      : await em.find(Capability, { id: { $in: ids } } as never);
  const byId = new Map(
    capabilities.map((capability) => [capability.id, capability]),
  );

  return roles.map((role) => ({
    name: role.name,
    capabilities: links
      .filter((link) => link.roleId === role.id && byId.has(link.capabilityId))
      .map((link) =>
        capabilityFromRow(byId.get(link.capabilityId) as Capability),
      ),
  }));
}
