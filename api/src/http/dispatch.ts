/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IncomingHttpHeaders } from 'node:http';
import { context } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import { type Answer, parse } from './answer.js';
import type { Route } from './route.js';

/** A request as either framework hands it over, before the route's schemas parse it. */
export interface RawRequest {
  readonly params: unknown;
  readonly query: unknown;
  readonly body: unknown;
  readonly headers: IncomingHttpHeaders;
  readonly ip: string;
  readonly cookies?: Readonly<Record<string, string | undefined>>;
  /** The Fastify secure session; `undefined` on Express. */
  readonly session?: unknown;
  /** The Express response or Fastify reply, for cookies set while the route runs. */
  readonly response: object;
}

/**
 * Runs around every route, before its schemas parse the request: it may refuse the
 * request by throwing, or run `work` inside a context of its own.
 */
export type Around = (
  request: RawRequest,
  work: () => Promise<Answer>,
) => Promise<Answer>;

/**
 * Parses a request's params, query and body with the route's schemas, in that order, and
 * runs the route, inside `around` when one is given. The HTTP server span of the
 * request, when tracing runs, takes the route's template as its `http.route`.
 *
 * @throws InvalidRequestError when a schema rejects its input, or what the route throws.
 */
export async function dispatch(
  route: Route,
  request: RawRequest,
  around?: Around,
): Promise<Answer> {
  const metadata = getRPCMetadata(context.active());
  if (metadata?.type === RPCType.HTTP) metadata.route = route.path;
  return around
    ? around(request, () => run(route, request))
    : run(route, request);
}

async function run(route: Route, request: RawRequest): Promise<Answer> {
  const params = parse(route.params, request.params, true);
  const query = parse(route.query, request.query);
  const body = parse(route.body, request.body);
  const result = await route.handle({
    params,
    query,
    body,
    headers: request.headers,
    ip: request.ip,
    cookies: request.cookies ?? {},
  });
  return {
    status: route.status ?? (route.method === 'POST' ? 201 : 200),
    body: result,
  };
}
