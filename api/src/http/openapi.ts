/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { STATUS_CODES } from 'node:http';
import { z } from 'zod';
import type { Route } from './route.js';

/** The parts of an OpenAPI document that do not come from the routes. */
export interface OpenApiOptions {
  readonly info: { title: string; version: string; description?: string };
  /** Parameters every operation takes, such as a tenant header. */
  readonly parameters?: readonly Record<string, unknown>[];
  readonly securitySchemes?: Record<string, Record<string, unknown>>;
  /** The security requirements every operation accepts, any one of them. */
  readonly security?: readonly Record<string, string[]>[];
}

type JsonSchema = {
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
};

function schemaOf(type: z.ZodType): JsonSchema {
  const { $schema: _, ...schema } = z.toJSONSchema(type, {
    io: 'input',
    unrepresentable: 'any',
  }) as JsonSchema;
  return schema;
}

function parameters(type: z.ZodType | undefined, where: 'path' | 'query') {
  if (!type) return [];
  const { properties = {}, required = [] } = schemaOf(type);
  return Object.entries(properties).map(([name, schema]) => ({
    name,
    in: where,
    required: where === 'path' || required.includes(name),
    schema,
  }));
}

function operation(route: Route, options: OpenApiOptions) {
  const status = route.status ?? (route.method === 'POST' ? 201 : 200);
  return {
    ...(route.summary ? { summary: route.summary } : {}),
    parameters: [
      ...(options.parameters ?? []),
      ...parameters(route.params, 'path'),
      ...parameters(route.query, 'query'),
    ],
    ...(route.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: schemaOf(route.body) } },
          },
        }
      : {}),
    responses: {
      [status]: {
        description: STATUS_CODES[status] ?? String(status),
        ...(route.response && status !== 204
          ? {
              content: {
                'application/json': { schema: schemaOf(route.response) },
              },
            }
          : {}),
      },
    },
    ...(options.security && !route.anonymous
      ? { security: options.security }
      : {}),
  };
}

/**
 * The OpenAPI 3.1 document of a route table: one operation per route, its path, query
 * and body parameters and its answer taken from the route's Zod schemas, and the
 * security of `options` unless the route is anonymous.
 *
 * @example
 * ```ts
 * const document = openApiDocument(routes, { info: { title: 'api', version: '1.0.0' } });
 * ```
 */
export function openApiDocument(
  routes: readonly Route[],
  options: OpenApiOptions,
) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const path = route.path.replace(/:(\w+)/g, '{$1}');
    paths[path] ??= {};
    paths[path][route.method.toLowerCase()] = operation(route, options);
  }
  return {
    openapi: '3.1.0',
    info: options.info,
    paths,
    ...(options.securitySchemes
      ? { components: { securitySchemes: options.securitySchemes } }
      : {}),
  };
}
