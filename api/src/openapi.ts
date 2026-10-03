/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { readFileSync, writeFileSync } from 'node:fs';
import type { App } from './app.js';
import { HEADERS } from './common/constants/headers.constants.js';
import { openApiDocument } from './http/openapi.js';
import { routes } from './routes.js';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

// Documenting reads only the routes' schemas; their handlers, and so the buses they
// close over, are never called. No database, Redis or other system is contacted.
const table = routes({ cqrs: {}, logins: {} } as unknown as App);

const document = openApiDocument(table, {
  info: {
    title: 'ddd-cqrs-api',
    version,
    description: [
      'The example application of the @cqrs-ddd packages: users, roles and sessions behind the pipeline behaviors.',
      '',
      `Every request names its tenant in \`${HEADERS.TENANT_SCHEMA}\`. The users and roles routes accept the access token of \`POST /auths/login\` as a Bearer token, an API client's \`${HEADERS.API_ID}\` and \`${HEADERS.API_KEY}\` headers, or, on Fastify, the \`session\` cookie.`,
    ].join('\n'),
  },
  parameters: [
    {
      in: 'header',
      name: HEADERS.TENANT_SCHEMA,
      required: true,
      description: 'The tenant of the request.',
      schema: { type: 'string' },
    },
  ],
  securitySchemes: {
    bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    'api-id': { type: 'apiKey', in: 'header', name: HEADERS.API_ID },
    'api-key': { type: 'apiKey', in: 'header', name: HEADERS.API_KEY },
    session: { type: 'apiKey', in: 'cookie', name: 'session' },
  },
  security: [{ bearer: [] }, { 'api-id': [], 'api-key': [] }, { session: [] }],
});

const [path = 'dist/openapi.json'] = process.argv.slice(2);
writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
console.log(`OpenAPI document written to ${path}`);
