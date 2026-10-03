/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type CommandBus, createCqrs } from '@cqrs-ddd/cqrs';
import {
  AUDIT_SEVERITY,
  AuditBehavior,
  type AuditRecord,
  type AuditSink,
} from '@cqrs-ddd/pipeline-audit';
import {
  type CaslAuthorizer,
  CaslBehavior,
  parseCapabilityString,
} from '@cqrs-ddd/pipeline-casl';
import { ResilienceBehavior } from '@cqrs-ddd/pipeline-resilience';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_DEFAULTS } from '../src/common/audit/audit.options.js';
import { AUDIT_ACTIONS } from '../src/common/constants/index.js';
import { sessionPrincipalStore } from '../src/common/context/session-principal.store.js';
import { DeleteRoleCommand } from '../src/roles/application/cqrs/commands/delete-role.command.js';
import { DeleteRoleHandler } from '../src/roles/application/cqrs/commands/delete-role.handler.js';
import { Role } from '../src/roles/domain/models/role.entity.js';
import { DeleteUserCommand } from '../src/users/application/cqrs/commands/delete-user.command.js';
import { DeleteUserHandler } from '../src/users/application/cqrs/commands/delete-user.handler.js';
import { User } from '../src/users/domain/models/user.entity.js';

describe('Deletion audit records fidelity', () => {
  const recorded: AuditRecord[] = [];

  const sink: AuditSink = {
    async write(record: AuditRecord): Promise<void> {
      recorded.push(record);
    },
  };

  let commandBus: CommandBus;

  beforeEach(async () => {
    recorded.length = 0;

    const users = {
      findById: vi.fn().mockImplementation(async (id: string) => {
        if (id.endsWith('99') || id === 'missing-user') return null;
        const user = User.create('Alice', 'alice@test.com', 'Engineering');
        Object.defineProperty(user, 'id', { value: id });
        return user;
      }),
      save: vi.fn().mockResolvedValue(null),
    };
    const roles = {
      findById: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'missing-role') return null;
        const role = Role.create('editor');
        Object.defineProperty(role, 'id', { value: id });
        return role;
      }),
      save: vi.fn().mockResolvedValue(null),
    };
    const authorizer = { authorize: vi.fn() } as unknown as CaslAuthorizer;
    const cqrs = createCqrs({
      logger: { log() {}, warn() {}, error() {} },
      bootstrapLogLevel: 'none',
      behaviors: [
        new AuditBehavior(sink, AUDIT_DEFAULTS),
        new CaslBehavior({
          load: async () => ({
            principal: { id: 'admin-1' },
            rules: [parseCapabilityString('all|manage|*')],
          }),
        }),
        new ResilienceBehavior(),
      ],
    });
    cqrs.register(
      new DeleteUserHandler(users, authorizer, cqrs.eventBus),
      new DeleteRoleHandler(roles, authorizer, cqrs.eventBus),
    );
    commandBus = cqrs.commandBus;
  });

  it('emits high-severity audit record carrying target and acting user on user deletion', async () => {
    const targetUserId = '019488e0-0000-7000-8000-000000000001';

    await sessionPrincipalStore.run(
      {
        id: 'admin-1',
        email: 'admin@test.com',
        tenant: 'tenant-a',
        department: 'Eng',
        type: 'user',
      },
      async () => {
        await commandBus.execute(new DeleteUserCommand({ id: targetUserId }));
      },
    );

    expect(recorded).toHaveLength(1);
    const [record] = recorded;
    expect(record.action).toBe(AUDIT_ACTIONS.USER_DELETE);
    expect(record.severity).toBe(AUDIT_SEVERITY.HIGH);
    expect(record.outcome).toBe('success');
    expect(record.actor).toEqual({
      id: 'admin-1',
      authenticated: true,
      principalType: 'user',
      email: 'admin@test.com',
    });
    expect(record.metadata).toEqual(
      expect.objectContaining({
        targetUserId,
      }),
    );
  });

  it('emits high-severity audit record carrying target and acting user on role deletion', async () => {
    const targetRoleId = '019488e0-0000-7000-8000-000000000002';

    await sessionPrincipalStore.run(
      {
        id: 'admin-2',
        email: 'admin2@test.com',
        tenant: 'tenant-a',
        department: 'Ops',
        type: 'user',
      },
      async () => {
        await commandBus.execute(new DeleteRoleCommand({ id: targetRoleId }));
      },
    );

    expect(recorded).toHaveLength(1);
    const [record] = recorded;
    expect(record.action).toBe(AUDIT_ACTIONS.ROLE_DELETE);
    expect(record.severity).toBe(AUDIT_SEVERITY.HIGH);
    expect(record.outcome).toBe('success');
    expect(record.actor).toEqual({
      id: 'admin-2',
      authenticated: true,
      principalType: 'user',
      email: 'admin2@test.com',
    });
    expect(record.metadata).toEqual(
      expect.objectContaining({
        targetRoleId,
      }),
    );
  });

  it('records unauthenticated actor when session context is absent', async () => {
    const targetUserId = '019488e0-0000-7000-8000-000000000003';

    await commandBus.execute(new DeleteUserCommand({ id: targetUserId }));

    expect(recorded).toHaveLength(1);
    const [record] = recorded;
    expect(record.actor).toEqual({ authenticated: false });
    expect(record.metadata).toEqual(
      expect.objectContaining({
        targetUserId,
      }),
    );
  });

  it('records audit record on failure with target metadata and actor preserved', async () => {
    const missingUserId = '019488e0-0000-7000-8000-000000000099';

    await expect(
      sessionPrincipalStore.run(
        {
          id: 'admin-fail',
          email: 'fail@test.com',
          tenant: 'tenant-a',
          type: 'user',
        },
        async () => {
          await commandBus.execute(
            new DeleteUserCommand({ id: missingUserId }),
          );
        },
      ),
    ).rejects.toThrow();

    expect(recorded).toHaveLength(1);
    const [record] = recorded;
    expect(record.outcome).toBe('failure');
    expect(record.action).toBe(AUDIT_ACTIONS.USER_DELETE);
    expect(record.severity).toBe(AUDIT_SEVERITY.HIGH);
    expect(record.actor).toEqual({
      id: 'admin-fail',
      authenticated: true,
      principalType: 'user',
      email: 'fail@test.com',
    });
    expect(record.metadata).toEqual(
      expect.objectContaining({
        targetUserId: missingUserId,
      }),
    );
  });
});
