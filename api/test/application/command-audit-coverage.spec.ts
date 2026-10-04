/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { getBehaviorId, pipelineOf } from '@cqrs-ddd/pipeline';
import { AuditBehavior } from '@cqrs-ddd/pipeline-audit';
import { describe, expect, it } from 'vitest';
import { CreateAuthHandler } from '../../src/auths/application/cqrs/commands/create-auth.handler.js';
import { RevokeAuthHandler } from '../../src/auths/application/cqrs/commands/revoke-auth.handler.js';
import { AUDIT_ACTIONS } from '../../src/common/constants/index.js';
import { CreateRoleHandler } from '../../src/roles/application/cqrs/commands/create-role.handler.js';
import { DeleteRoleHandler } from '../../src/roles/application/cqrs/commands/delete-role.handler.js';
import { UpdateRoleHandler } from '../../src/roles/application/cqrs/commands/update-role.handler.js';
import { CreateUserHandler } from '../../src/users/application/cqrs/commands/create-user.handler.js';
import { DeleteUserHandler } from '../../src/users/application/cqrs/commands/delete-user.handler.js';
import { UpdateUserHandler } from '../../src/users/application/cqrs/commands/update-user.handler.js';

function auditAction(handler: abstract new (...args: never[]) => unknown) {
  const { types, options } = pipelineOf(handler);
  if (!types.includes(AuditBehavior)) return undefined;
  return options.get(getBehaviorId(AuditBehavior))?.action;
}

describe('command handlers declare an audit action', () => {
  it.each([
    ['CreateUserHandler', CreateUserHandler, AUDIT_ACTIONS.USER_CREATE],
    ['UpdateUserHandler', UpdateUserHandler, AUDIT_ACTIONS.USER_UPDATE],
    ['DeleteUserHandler', DeleteUserHandler, AUDIT_ACTIONS.USER_DELETE],
    ['CreateRoleHandler', CreateRoleHandler, AUDIT_ACTIONS.ROLE_CREATE],
    ['UpdateRoleHandler', UpdateRoleHandler, AUDIT_ACTIONS.ROLE_UPDATE],
    ['DeleteRoleHandler', DeleteRoleHandler, AUDIT_ACTIONS.ROLE_DELETE],
    ['CreateAuthHandler', CreateAuthHandler, AUDIT_ACTIONS.AUTH_LOGIN],
    ['RevokeAuthHandler', RevokeAuthHandler, AUDIT_ACTIONS.AUTH_LOGOUT],
  ])('%s declares an audit action', (_name, handler, action) => {
    expect(auditAction(handler)).toBe(action);
  });
});
