/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MikroORM } from '@mikro-orm/libsql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roleCapabilities } from '../../test/support/role-capabilities.js';
import { Migration20260830000000 } from './migrations/Migration20260830000000.js';
import { createLibsqlOrmOptions } from './orm-options.js';

describe('the roles seeded by the initial migration', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...createLibsqlOrmOptions(':memory:'),
      debug: false,
      migrations: {
        migrationsList: [Migration20260830000000],
        snapshot: false,
      },
    });
    await orm.migrator.up();
  });

  afterAll(async () => {
    await orm?.close(true);
  });

  it('seeds the five system roles', async () => {
    const roles = await roleCapabilities(orm.em.fork());
    expect(roles.map((role) => role.name).sort()).toEqual(
      ['admin', 'self', 'support-agent', 'user-manager', 'viewer'].sort(),
    );
  });

  it('gives each role only its own capabilities', async () => {
    const roles = await roleCapabilities(orm.em.fork(), ['admin', 'viewer']);
    const capabilities = (name: string) =>
      roles.find((role) => role.name === name)?.capabilities;

    expect(capabilities('admin')).toEqual([
      expect.objectContaining({ action: 'manage', subject: 'all' }),
    ]);
    expect(capabilities('viewer')).toEqual([
      expect.objectContaining({ action: 'read', subject: 'User' }),
    ]);
  });
});
