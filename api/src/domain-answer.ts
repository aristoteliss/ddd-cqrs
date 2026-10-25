/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { DomainException } from '@cqrs-ddd/core/domain';
import {
  AuthConfigurationError,
  InvalidLoginCredentialsException,
} from './auths/domain/models/errors/authentication.exception.js';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
} from './auths/domain/models/errors/refresh-token.errors.js';
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
  const { message } = exception;
  if (
    exception instanceof InvalidRefreshTokenError ||
    exception instanceof RefreshTokenReuseError
  ) {
    return reply({
      statusCode: 401,
      error: 'Unauthorized',
      message,
      code: exception.code,
    });
  }
  if (exception instanceof InvalidLoginCredentialsException) {
    return reply({ statusCode: 401, error: 'Unauthorized', message });
  }
  if (exception instanceof AuthConfigurationError) {
    return reply({ statusCode: 500, error: 'Internal Server Error', message });
  }
  if (
    exception instanceof UniqueEmailException ||
    exception instanceof UniqueRoleNameException
  ) {
    return reply({ statusCode: 409, error: 'Conflict', message });
  }
  if (
    exception instanceof InvalidUsernameException ||
    exception instanceof InvalidDepartmentException ||
    exception instanceof InvalidRoleNameException
  ) {
    return reply({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message,
      ...exception.violation,
    });
  }
  return undefined;
}

type AnswerBody = {
  statusCode: number;
  error: string;
  message: string;
  [field: string]: unknown;
};

function reply(body: AnswerBody): Answer {
  return { status: body.statusCode, body };
}
