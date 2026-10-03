/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { DomainException } from '@cqrs-ddd/core/domain';
import {
  AuthConfigurationException,
  InvalidLoginCredentialsException,
} from './auths/domain/errors/authentication.exception.js';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
} from './auths/domain/errors/refresh-token.errors.js';
import type { Answer } from './http/answer.js';
import {
  InvalidRoleNameException,
  UniqueRoleNameException,
} from './roles/domain/models/errors/role-name.exception.js';
import {
  InvalidDepartmentException,
  InvalidUsernameException,
  UniqueEmailException,
} from './users/domain/models/errors/index.js';

/**
 * The answers of the application's own domain errors: a refused credential is 401, a
 * taken unique value 409, a rejected value 422 with its violation, and a missing
 * authentication setting 500. Other domain errors fall through to the default mapping.
 *
 * @example
 * ```ts
 * expressApp({ routes, context, logger, domain: domainAnswer });
 * ```
 */
export function domainAnswer(exception: DomainException): Answer | undefined {
  if (
    exception instanceof InvalidRefreshTokenError ||
    exception instanceof RefreshTokenReuseError
  ) {
    return reply(401, 'Unauthorized', exception.message, {
      code: exception.code,
    });
  }
  if (exception instanceof InvalidLoginCredentialsException) {
    return reply(401, 'Unauthorized', exception.message);
  }
  if (exception instanceof AuthConfigurationException) {
    return reply(500, 'Internal Server Error', exception.message);
  }
  if (
    exception instanceof UniqueEmailException ||
    exception instanceof UniqueRoleNameException
  ) {
    return reply(409, 'Conflict', exception.message);
  }
  if (
    exception instanceof InvalidUsernameException ||
    exception instanceof InvalidDepartmentException ||
    exception instanceof InvalidRoleNameException
  ) {
    return reply(422, 'Unprocessable Entity', exception.message, {
      ...exception.violation,
    });
  }
  return undefined;
}

function reply(
  statusCode: number,
  error: string,
  message: string,
  extra: Record<string, unknown> = {},
): Answer {
  return { status: statusCode, body: { statusCode, error, message, ...extra } };
}
