/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type EntityManager, LockMode } from '@mikro-orm/core';
import { RoleCapability } from '../../persistence/entities/role-capability.entity.js';
import { UserAdditionalCapability } from '../../persistence/entities/user-additional-capability.entity.js';
import { UserDeniedCapability } from '../../persistence/entities/user-denied-capability.entity.js';
import {
  UserPermissionRule,
  type UserPermissionRuleSource,
} from '../../persistence/entities/user-permission-rule.entity.js';
import { UserRole } from '../../persistence/entities/user-role.entity.js';
import { Capability } from '../../roles/domain/models/capability.entity.js';
import { User } from '../../users/domain/models/user.entity.js';

const BATCH_SIZE = 500;

/** One materialized rule without its absolute position. */
type RuleRow = Omit<UserPermissionRule, 'userId' | 'position'>;

/** The source rows of one batch of users, and the capabilities they reference by id. */
type RuleSources = {
  userRoles: UserRole[];
  additional: UserAdditionalCapability[];
  denied: UserDeniedCapability[];
  capabilitiesOfRole: Map<string, string[]>;
  capabilities: Map<string, Capability>;
};

function byId(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function chunks<T>(items: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    result.push(items.slice(start, start + BATCH_SIZE));
  }

  return result;
}

/**
 * The only writer of `user_permission_rules`.
 *
 * Rows per user, positions from 1: role rules by role id then capability id,
 * then additional rules, then denied rules (always inverted), each group by
 * capability id. Rule columns are copied verbatim, placeholders included.
 */
export class UserPermissionsProjector {
  /** Replaces the materialized rules of `userIds` inside the caller's transaction. */
  async rebuild(em: EntityManager, userIds: readonly string[]): Promise<void> {
    for (const batch of chunks([...new Set(userIds)].sort(byId))) {
      await this.lockUsers(em, batch);
      const expected = await this.expectedRules(em, batch);
      await em.nativeDelete(UserPermissionRule, { userId: { $in: batch } });

      const rows = batch.flatMap((userId) =>
        (expected.get(userId) ?? []).map(
          (rule, index): UserPermissionRule => ({
            userId,
            position: index + 1,
            ...rule,
          }),
        ),
      );
      if (rows.length > 0) await em.insertMany(UserPermissionRule, rows);
    }
  }

  /** Users whose materialized rules differ from their source tables. */
  async findDrift(
    em: EntityManager,
    userIds?: readonly string[],
  ): Promise<string[]> {
    const ids =
      userIds ??
      (
        await em.find(User, {}, {
          fields: ['id'],
          disableIdentityMap: true,
        } as never)
      ).map((user) => user.id);
    const drifted: string[] = [];

    for (const batch of chunks([...new Set(ids)].sort(byId))) {
      const expected = await this.expectedRules(em, batch);
      const stored = await em.find(
        UserPermissionRule,
        { userId: { $in: batch } },
        {
          orderBy: [
            { userId: 'asc' },
            { inverted: 'asc' },
            { position: 'asc' },
          ],
          disableIdentityMap: true,
        },
      );
      drifted.push(
        ...batch.filter((userId) => hasDrifted(userId, stored, expected)),
      );
    }

    return drifted;
  }

  private async lockUsers(em: EntityManager, batch: string[]): Promise<void> {
    if (!em.isInTransaction()) {
      throw new Error(
        'UserPermissionsProjector.rebuild() requires a transaction.',
      );
    }
    // Ascending id order prevents lock-order deadlocks between concurrent rebuilds.
    // SQLite has no row locks; MikroORM omits the clause there.
    await em.find(User, { id: { $in: batch } }, {
      fields: ['id'],
      orderBy: { id: 'asc' },
      lockMode: LockMode.PESSIMISTIC_WRITE,
      disableIdentityMap: true,
    } as never);
  }

  private async expectedRules(
    em: EntityManager,
    batch: string[],
  ): Promise<Map<string, RuleRow[]>> {
    const sources = await readSources(em, batch);
    const result = new Map<string, RuleRow[]>();
    for (const userId of batch) {
      result.set(userId, userRules(userId, sources));
    }

    return result;
  }
}

function hasDrifted(
  userId: string,
  stored: readonly UserPermissionRule[],
  expected: ReadonlyMap<string, RuleRow[]>,
): boolean {
  const actual = stored.filter((row) => row.userId === userId);
  const wanted = [...(expected.get(userId) ?? [])].sort(
    (a, b) => Number(a.inverted) - Number(b.inverted),
  );

  return !sameSequence(actual, wanted);
}

function sameSequence(
  actual: readonly UserPermissionRule[],
  wanted: readonly RuleRow[],
): boolean {
  if (actual.length !== wanted.length) return false;
  return actual.every((stored, index) => {
    const rule = wanted[index];
    return (
      stored.source === rule.source &&
      (stored.roleId ?? null) === rule.roleId &&
      stored.capabilityId === rule.capabilityId &&
      stored.subject === rule.subject &&
      stored.action === rule.action &&
      (stored.conditions ?? null) === rule.conditions &&
      (stored.fields ?? null) === rule.fields &&
      Boolean(stored.inverted) === rule.inverted &&
      (stored.reason ?? null) === rule.reason
    );
  });
}

async function readSources(
  em: EntityManager,
  batch: string[],
): Promise<RuleSources> {
  const read = { disableIdentityMap: true };
  const [userRoles, additional, denied] = await Promise.all([
    em.find(UserRole, { userId: { $in: batch } }, read),
    em.find(UserAdditionalCapability, { userId: { $in: batch } }, read),
    em.find(UserDeniedCapability, { userId: { $in: batch } }, read),
  ]);

  const roleIds = [...new Set(userRoles.map((link) => link.roleId))];
  const roleLinks =
    roleIds.length === 0
      ? []
      : await em.find(RoleCapability, { roleId: { $in: roleIds } }, read);

  const capabilityIds = [
    ...new Set([
      ...roleLinks.map((link) => link.capabilityId),
      ...additional.map((link) => link.capabilityId),
      ...denied.map((link) => link.capabilityId),
    ]),
  ];
  const capabilities = new Map(
    (capabilityIds.length === 0
      ? []
      : await em.find(Capability, { id: { $in: capabilityIds } } as never, read)
    ).map((capability) => [capability.id, capability]),
  );

  return {
    userRoles,
    additional,
    denied,
    capabilitiesOfRole: groupByRole(roleLinks),
    capabilities,
  };
}

function groupByRole(
  roleLinks: readonly RoleCapability[],
): Map<string, string[]> {
  const capabilitiesOfRole = new Map<string, string[]>();
  for (const link of roleLinks) {
    const list = capabilitiesOfRole.get(link.roleId) ?? [];
    list.push(link.capabilityId);
    capabilitiesOfRole.set(link.roleId, list);
  }

  return capabilitiesOfRole;
}

function userRules(
  userId: string,
  {
    userRoles,
    additional,
    denied,
    capabilitiesOfRole,
    capabilities,
  }: RuleSources,
): RuleRow[] {
  const rules: RuleRow[] = [];
  const rowsOf = (
    capabilityIds: readonly string[],
    source: UserPermissionRuleSource,
    roleId: string | null,
  ) =>
    capabilityIds.flatMap((capabilityId) => {
      const capability = capabilities.get(capabilityId);

      return capability ? [toRow(capability, source, roleId)] : [];
    });
  const roles = userRoles
    .filter((link) => link.userId === userId)
    .map((link) => link.roleId)
    .sort(byId);
  for (const roleId of roles) {
    const ids = [...(capabilitiesOfRole.get(roleId) ?? [])].sort(byId);
    rules.push(...rowsOf(ids, 'role', roleId));
  }
  for (const [source, links] of [
    ['additional', additional],
    ['denied', denied],
  ] as const) {
    const ids = links
      .filter((link) => link.userId === userId)
      .map((link) => link.capabilityId)
      .sort(byId);
    rules.push(...rowsOf(ids, source, null));
  }

  return rules;
}

function toRow(
  capability: Capability,
  source: UserPermissionRuleSource,
  roleId: string | null,
): RuleRow {
  return {
    source,
    roleId,
    capabilityId: capability.id,
    subject: capability.subject,
    action: capability.action,
    conditions: capability.conditions ?? null,
    fields: capability.fields ?? null,
    inverted: source === 'denied' ? true : capability.inverted,
    reason: capability.reason ?? null,
  };
}
