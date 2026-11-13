/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Logger } from 'pino';
import { type Answer, answer, type DomainAnswer } from './answer.js';
import type { Middleware } from './context.js';
import type { Around } from './dispatch.js';
import type { Route } from './route.js';

/** What both mounts take: the routes, the request context and the error mapping. */
export interface MountOptions {
  readonly routes: readonly Route[];
  readonly context: Middleware;
  readonly logger: Logger;
  readonly domain?: DomainAnswer;
  /** Runs around every route, such as the authentication of its caller. */
  readonly around?: Around;
}

/** The answer for an error, logging the ones that answer 500. */
export function failed(
  error: unknown,
  options: Pick<MountOptions, 'domain' | 'logger'>,
): Answer {
  const result = answer(error, options.domain);

  if (result.status >= 500)
    options.logger.error({ err: error }, 'request failed');

  return result;
}
