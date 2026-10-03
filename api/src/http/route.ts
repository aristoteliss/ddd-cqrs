/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IncomingHttpHeaders } from 'node:http';
import type { z } from 'zod';

/** The HTTP methods the API answers. */
export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** What a route reads from its request, after its schemas parsed it. */
export interface RouteInput<Params, Query, Body> {
  readonly params: Params;
  readonly query: Query;
  readonly body: Body;
  readonly headers: IncomingHttpHeaders;
  readonly ip: string;
  readonly cookies: Readonly<Record<string, string | undefined>>;
}

/**
 * One endpoint: a method, an Express-style path (`/users/:id`), the Zod schemas of its
 * inputs, and the function that answers it. A schema that rejects its input answers 400
 * with `{ formErrors, fieldErrors }` before `handle` runs.
 */
export interface Route<Params = unknown, Query = unknown, Body = unknown> {
  readonly method: Method;
  readonly path: string;
  readonly params?: z.ZodType<Params>;
  readonly query?: z.ZodType<Query>;
  readonly body?: z.ZodType<Body>;
  /** The status of a successful answer. @default 201 for `POST`, else 200 */
  readonly status?: number;
  /** A short description of the route, for the OpenAPI document. */
  readonly summary?: string;
  /** The schema of a successful answer's body, for the OpenAPI document. */
  readonly response?: z.ZodType;
  /** The route takes no credential, so the OpenAPI document lists no security for it. */
  readonly anonymous?: boolean;
  /** Returns the body of the answer; `undefined` sends none. */
  handle(input: RouteInput<Params, Query, Body>): Promise<unknown>;
}

/**
 * Declares a route, inferring the types its `handle` receives from its schemas.
 *
 * @example
 * ```ts
 * export const getUser = route({
 *   method: 'GET',
 *   path: '/users/:id',
 *   params: z.object({ id: z.uuid() }),
 *   handle: ({ params }) => queryBus.execute(new GetUserQuery({ userId: params.id })),
 * });
 * ```
 */
export function route<Params = unknown, Query = unknown, Body = unknown>(
  definition: Route<Params, Query, Body>,
): Route {
  return definition as Route;
}
