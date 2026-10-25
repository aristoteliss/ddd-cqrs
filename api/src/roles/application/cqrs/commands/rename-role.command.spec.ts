/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { describe, expect, it } from 'vitest';
import { RenameRoleCommand } from './rename-role.command.js';

describe('RenameRoleCommand', () => {
  it('marks exactly the field the update handler writes, which CASL checks', () => {
    expect(RenameRoleCommand.updatableFields).toEqual(['name']);
  });

  it('reports the updatable fields the command carries', () => {
    const command = new RenameRoleCommand({
      id: '019488e0-0000-7000-8000-000000000001',
      name: 'admin',
    });

    expect(command.getUpdateFields(RenameRoleCommand.updatableFields)).toEqual([
      'name',
    ]);
  });
});
