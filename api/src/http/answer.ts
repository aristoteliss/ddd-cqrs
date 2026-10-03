/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { STATUS_CODES } from 'node:http';
import { DomainException } from '@cqrs-ddd/core/domain';
import { domainErrorHttpStatus } from '@cqrs-ddd/core/http';
import { UnauthorizedActionException } from '@cqrs-ddd/pipeline-casl';
import { toHttpResponse as caslAnswer } from '@cqrs-ddd/pipeline-casl/http';
import { FeatureDisabledError } from '@cqrs-ddd/pipeline-feature-flags';
import { toHttpResponse as featureAnswer } from '@cqrs-ddd/pipeline-feature-flags/http';
import { IdempotencyConflictError } from '@cqrs-ddd/pipeline-idempotency';
import { toHttpResponse as idempotencyAnswer } from '@cqrs-ddd/pipeline-idempotency/http';
import { RateLimitExceededError } from '@cqrs-ddd/pipeline-rate-limit';
import { toHttpResponse as rateLimitAnswer } from '@cqrs-ddd/pipeline-rate-limit/http';
import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { toHttpResponse as zodAnswer } from '@cqrs-ddd/pipeline-zod/http';
import type { z } from 'zod';

/** A status, a JSON body and headers, for either framework to send. */
export interface Answer {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

/** A route's input that its schema rejected; it answers 400 before the route runs. */
export class InvalidRequestError extends Error {
  constructor(readonly issues: readonly z.core.$ZodIssue[]) {
    super('Invalid request');
  }
}

/**
 * Maps a domain exception to its answer, or returns `undefined` for the default
 * `domainErrorHttpStatus` mapping. Feature modules add the exceptions they define.
 */
export type DomainAnswer = (exception: DomainException) => Answer | undefined;

/**
 * Parses one input of a request with its route's schema. With `single`, each property
 * of the input is a value on its own, such as a path parameter, and an issue reports
 * against that value: a form error, not a field error.
 *
 * @throws InvalidRequestError when the schema rejects the input.
 *
 * @example
 * ```ts
 * parse(z.object({ id: z.uuid() }), { id: 'x' }, true); // throws, formErrors ['Invalid UUID']
 * ```
 */
export function parse<T>(
  schema: z.ZodType<T> | undefined,
  input: unknown,
  single = false,
): T {
  if (!schema) return input as T;
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new InvalidRequestError(
    single
      ? result.error.issues.map((issue) => ({
          ...issue,
          path: issue.path.slice(1),
        }))
      : result.error.issues,
  );
}

/**
 * The answer for an error a route threw: request validation (400 with
 * `{ formErrors, fieldErrors }`), every package's HTTP mapping, the domain exceptions
 * (first through `domain`), a client error of the framework such as malformed JSON, or 500.
 */
export function answer(
  error: unknown,
  domain: DomainAnswer = () => undefined,
): Answer {
  if (error instanceof InvalidRequestError) {
    return { status: 400, body: flatten(error.issues) };
  }
  if (error instanceof ZodValidationError) return zodAnswer(error);
  if (error instanceof UnauthorizedActionException) return caslAnswer(error);
  if (error instanceof FeatureDisabledError) return featureAnswer(error);
  if (error instanceof IdempotencyConflictError)
    return idempotencyAnswer(error);
  if (error instanceof RateLimitExceededError) return rateLimitAnswer(error);
  if (error instanceof DomainException) {
    const mapped = domain(error);
    if (mapped) return mapped;
    const { statusCode, error: reason, message } = domainErrorHttpStatus(error);
    return { status: statusCode, body: { statusCode, error: reason, message } };
  }
  const status = clientStatus(error);
  if (status) {
    return {
      status,
      body: {
        statusCode: status,
        message: (error as Error).message,
        error: STATUS_CODES[status],
      },
    };
  }
  return {
    status: 500,
    body: { statusCode: 500, message: 'Internal server error' },
  };
}

/** The answer for a route that does not exist. */
export function notFound(method: string, url: string): Answer {
  return {
    status: 404,
    body: {
      message: `Cannot ${method} ${url}`,
      error: 'Not Found',
      statusCode: 404,
    },
  };
}

function flatten(issues: readonly z.core.$ZodIssue[]) {
  const formErrors: string[] = [];
  const fieldErrors: Record<string, string[]> = {};
  for (const { message, path } of issues) {
    const [segment] = path;
    if (segment === undefined) {
      formErrors.push(message);
      continue;
    }
    const field = String(segment);
    fieldErrors[field] ??= [];
    fieldErrors[field].push(message);
  }
  return { formErrors, fieldErrors };
}

function clientStatus(error: unknown): number | undefined {
  const status =
    (error as { statusCode?: unknown; status?: unknown } | null)?.statusCode ??
    (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500
    ? status
    : undefined;
}
