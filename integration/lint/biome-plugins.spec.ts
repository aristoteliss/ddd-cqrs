/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
let directory: string;

function lintFixture(relativePath: string, source: string) {
  const target = resolve(directory, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
  const result = spawnSync(
    resolve(root, 'node_modules/.bin/biome'),
    ['lint', `--config-path=${directory}`, target],
    { encoding: 'utf8', cwd: directory },
  );
  if (result.error) throw result.error;
  return { status: result.status, diagnostics: result.stdout + result.stderr };
}

beforeAll(() => {
  directory = mkdtempSync(resolve(tmpdir(), 'biome-plugins-'));
  const configuration = JSON.parse(
    readFileSync(resolve(root, 'biome.json'), 'utf8'),
  );
  configuration.plugins = configuration.plugins.map(
    (plugin: { path: string; includes: string[] }) => ({
      ...plugin,
      path: resolve(root, plugin.path),
    }),
  );
  configuration.linter.rules = { recommended: false };
  configuration.overrides = [];
  writeFileSync(
    resolve(directory, 'biome.json'),
    JSON.stringify(configuration),
  );
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('Biome Grit test-suite plugin', () => {
  it('accepts standard test structures without focused executions', () => {
    const source = `
      import { describe, it, expect } from 'vitest';
      describe('my-suite', () => {
        it('passes', () => {
          expect(1).toBe(1);
        });
      });
    `;
    expect(
      lintFixture('packages/test-pkg/sample.spec.ts', source),
    ).toMatchObject({ status: 0 });
  });

  it.each(['describe.only', 'it.only', 'test.only', 'fit', 'fdescribe'])(
    'rejects focused execution %s in test files',
    (token) => {
      const source = `
        import { describe, it, test } from 'vitest';
        ${token}('should fail', () => {});
      `;
      const result = lintFixture(
        'packages/test-pkg/sample-focused.spec.ts',
        source,
      );
      expect(result.status).toBe(1);
      expect(result.diagnostics).toContain('Do not commit focused tests');
    },
  );
});

describe('Biome Grit framework-independence plugin', () => {
  it.each([
    `import { Injectable } from '@nestjs/common';`,
    `import type { IPipelineContext } from '@nestjs-pipeline/core';`,
    `import * as cqrs from '@nestjs/cqrs';`,
    `import '@nestjs/core';`,
    `export { pipelineStore } from '@nestjs-pipeline/core';`,
    `export * from '@nestjs-pipeline/correlation';`,
    `import cls = require('nestjs-cls');`,
    `declare module '@nestjs/common' {}`,
    `export const load = () => import('@nestjs/common');`,
    `const { EventBus } = require('@nestjs/cqrs');`,
  ])('rejects %s in core', (source) => {
    const result = lintFixture('packages/core/application/coupled.ts', source);
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain('This package is framework-neutral');
  });

  it.each([
    'packages/core/application/coupled.spec.ts',
    'packages/mikro-orm/src/coupled.ts',
    'packages/uuidv7/src/index.ts',
    'packages/safe-stringify/src/index.ts',
    'packages/pipeline/src/index.ts',
    'packages/pipeline-cache/src/cache.behavior.ts',
  ])('covers %s', (path) => {
    expect(
      lintFixture(path, `import { Injectable } from '@nestjs/common';`).status,
    ).toBe(1);
  });

  it('accepts built-ins, MikroORM, relative paths, and NestJS names in strings or comments', () => {
    const source = `
      import { AsyncLocalStorage } from 'node:async_hooks';
      import { Type } from '@mikro-orm/core';
      import { helper } from './nestjs/helper';
      // A NestJS handler passes the EventBus injected from '@nestjs/cqrs'.
      export const fixture = \`import { Injectable } from '@nestjs/common';\`;
      export const moduleName = '@nestjs/common';
      export const load = () => import('./local');
    `;
    expect(
      lintFixture('packages/mikro-orm/src/neutral.ts', source),
    ).toMatchObject({ status: 0 });
  });

  it('leaves code outside the packages to its own rules', () => {
    expect(
      lintFixture(
        'integration/release/consumer/src/consumer.ts',
        `import { Injectable } from '@nestjs/common';`,
      ).status,
    ).toBe(0);
  });
});

describe('Biome Grit core-environment plugin', () => {
  it('rejects a process.env read in core', () => {
    const result = lintFixture(
      'packages/core/persistence/helpers/key.helper.ts',
      `export const SCHEMA = process.env.DB_DEFAULT_SCHEMA || 'tenant';`,
    );
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'Do not read process.env in shared library or DDD core code',
    );
  });

  it('rejects a process.env read in a pipeline package', () => {
    expect(
      lintFixture(
        'packages/pipeline-cache/src/config.ts',
        `export const url = process.env.REDIS_URL;`,
      ).status,
    ).toBe(1);
  });

  it('ignores process.env appearing only in a JSDoc example', () => {
    const source = `
      /**
       * @example
       * \`\`\`ts
       * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
       * \`\`\`
       */
      export const helper = () => 1;
    `;
    expect(
      lintFixture('packages/pipeline-cache/src/documented.ts', source),
    ).toMatchObject({ status: 0 });
  });
});

describe('Biome Grit orm-independence plugin', () => {
  it.each([
    `import { EntityManager } from '@mikro-orm/core';`,
    `import type { Type } from '@mikro-orm/core';`,
    `export { EntitySchema } from '@mikro-orm/core';`,
    `import { DataSource } from 'typeorm';`,
    `import { PrismaClient } from '@prisma/client';`,
    `import { eq } from 'drizzle-orm';`,
    `import { Pool } from 'pg';`,
    `import { createClient } from '@libsql/client';`,
    `export const load = () => import('@mikro-orm/core');`,
    `const { MikroORM } = require('@mikro-orm/core');`,
  ])('rejects %s in core', (source) => {
    const result = lintFixture('packages/core/persistence/coupled.ts', source);
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain('@cqrs-ddd/core is ORM-neutral');
  });

  it('covers core specs', () => {
    expect(
      lintFixture(
        'packages/core/persistence/coupled.spec.ts',
        `import { EntityManager } from '@mikro-orm/core';`,
      ).status,
    ).toBe(1);
  });

  it('accepts ORM names in strings and comments, and look-alike module names', () => {
    const source = `
      import { helper } from './mikro-orm/helper';
      // Adapters for '@mikro-orm/core' live in @cqrs-ddd/mikro-orm.
      export const moduleName = '@mikro-orm/core';
      export const note = 'pg';
    `;
    expect(
      lintFixture('packages/core/persistence/neutral.ts', source),
    ).toMatchObject({ status: 0 });
  });

  it('leaves MikroORM imports to the adapter package', () => {
    expect(
      lintFixture(
        'packages/mikro-orm/src/adapter.ts',
        `import { EntityManager } from '@mikro-orm/core';`,
      ).status,
    ).toBe(0);
  });
});

describe('Biome Grit pipeline-independence plugin', () => {
  it.each([
    `import { DomainException } from '@cqrs-ddd/core/domain';`,
    `import type { BaseQuery } from '@cqrs-ddd/core/application';`,
    `import { AggregateRoot } from '@cqrs-ddd/core';`,
    `export * from '@cqrs-ddd/core/persistence';`,
    `import { TenantStore } from '@cqrs-ddd/mikro-orm';`,
    `export const load = () => import('@cqrs-ddd/core/domain');`,
    `const { optimisticUpdate } = require('@cqrs-ddd/mikro-orm');`,
  ])('rejects %s in a pipeline package', (source) => {
    const result = lintFixture(
      'packages/pipeline-cache/src/coupled.ts',
      source,
    );
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'A pipeline package does not depend on @cqrs-ddd/core',
    );
  });

  it.each([
    'packages/pipeline/src/coupled.ts',
    'packages/pipeline-cache/src/coupled.spec.ts',
  ])('covers %s', (path) => {
    expect(
      lintFixture(
        path,
        `import { DomainException } from '@cqrs-ddd/core/domain';`,
      ).status,
    ).toBe(1);
  });

  it('accepts the utilities, other pipeline packages, and package names in strings or comments', () => {
    const source = `
      import { stableStringify } from '@cqrs-ddd/safe-stringify';
      import { uuidv7 } from '@cqrs-ddd/uuidv7';
      import { tenantSource } from '@cqrs-ddd/pipeline-tenant';
      // A @cqrs-ddd/core request brands itself; nothing here imports '@cqrs-ddd/core'.
      export const kind = Symbol.for('@cqrs-ddd/request-kind');
      export const moduleName = '@cqrs-ddd/core';
      export const key = () => stableStringify({ id: uuidv7(), tenantSource });
    `;
    expect(
      lintFixture('packages/pipeline-cache/src/neutral.ts', source),
    ).toMatchObject({ status: 0 });
  });

  it('leaves the MikroORM adapter free to import core', () => {
    expect(
      lintFixture(
        'packages/mikro-orm/src/adapter.ts',
        `import { DomainException } from '@cqrs-ddd/core/domain';`,
      ).status,
    ).toBe(0);
  });
});

describe('Biome Grit ddd-independence plugin', () => {
  it.each([
    `import { createPipeline } from '@cqrs-ddd/pipeline';`,
    `import type { IPipelineContext } from '@cqrs-ddd/pipeline';`,
    `import { CacheBehavior } from '@cqrs-ddd/pipeline-cache';`,
    `export * from '@cqrs-ddd/pipeline-tenant';`,
    `import { httpStatus } from '@cqrs-ddd/pipeline-idempotency/http';`,
    `export const load = () => import('@cqrs-ddd/pipeline');`,
    `const { tenantSource } = require('@cqrs-ddd/pipeline-tenant');`,
  ])('rejects %s in core', (source) => {
    const result = lintFixture('packages/core/application/coupled.ts', source);
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain('do not depend on a pipeline package');
  });

  it.each([
    'packages/mikro-orm/src/coupled.ts',
    'packages/core/application/coupled.spec.ts',
  ])('covers %s', (path) => {
    expect(
      lintFixture(path, `import { createPipeline } from '@cqrs-ddd/pipeline';`)
        .status,
    ).toBe(1);
  });

  it('accepts the utilities and the request-kind brand', () => {
    const source = `
      import { stableStringify } from '@cqrs-ddd/safe-stringify';
      import { uuidv7 } from '@cqrs-ddd/uuidv7';
      // Pipelines from '@cqrs-ddd/pipeline' read this brand.
      export const REQUEST_KIND = Symbol.for('@cqrs-ddd/request-kind');
      export const id = () => stableStringify({ id: uuidv7() });
    `;
    expect(
      lintFixture('packages/core/application/request-kind.ts', source),
    ).toMatchObject({ status: 0 });
  });

  it('leaves pipeline packages free to import each other', () => {
    expect(
      lintFixture(
        'packages/pipeline-cache/src/engine.ts',
        `import { createPipeline } from '@cqrs-ddd/pipeline';`,
      ).status,
    ).toBe(0);
  });
});

describe('Biome Grit aggregate-identity plugin', () => {
  it.each([
    "role['name'] = 'Admin';",
    'role["name"] = "Admin";',
    "role.name += '!';",
    'user.version += 1;',
    'user.version -= 1;',
    'user.version *= 2;',
    'user.version /= 2;',
    'user.version %= 2;',
    'user.version **= 2;',
    'user.version <<= 1;',
    'user.version >>= 1;',
    'user.version >>>= 1;',
    'user.version &= 1;',
    'user.version |= 1;',
    'user.version ^= 1;',
    "role.name ||= 'Admin';",
    "role.name &&= 'Admin';",
    "role.name ??= 'Admin';",
    'user.version++;',
    '--user.version;',
    "entity['version']++;",
    "++aggregate['version'];",
  ])(
    'rejects aggregate mutation syntax in core application code: %s',
    (code) => {
      const result = lintFixture(
        'packages/core/application/mutation.ts',
        `export function mutate(user: any, role: any, entity: any, aggregate: any) { ${code} }`,
      );
      expect(result.status).toBe(1);
      expect(result.diagnostics).toContain(
        'Do not assign aggregate properties directly',
      );
    },
  );

  it.each([
    "dto.name = 'display';",
    "dto['name'] += '!';",
    'snapshot.version++;',
    "response.username = 'alice';",
    "command.department = 'Engineering';",
    "user.displayName = 'Alice';",
    "role.description = 'Manager';",
    "this.name = 'CustomError';",
  ])('allows unrelated writes: %s', (code) => {
    expect(
      lintFixture(
        'packages/core/application/mapping.ts',
        `export function map(dto: any, snapshot: any, response: any, command: any, user: any, role: any) { ${code} }`,
      ).status,
    ).toBe(0);
  });

  // These cases document the syntax-only boundary rather than type enforcement.
  it.each([
    "const loaded = role; loaded.name = 'Admin';",
    "const key = 'name'; role[key] = 'Admin';",
    "Object.assign(role, { name: 'Admin' });",
  ])('does not resolve aliases, computed keys or reflection: %s', (code) => {
    expect(
      lintFixture(
        'packages/core/application/limitations.ts',
        `export function mutate(role: any) { ${code} }`,
      ).status,
    ).toBe(0);
  });

  it('leaves domain models, which assign their own state, alone', () => {
    expect(
      lintFixture(
        'packages/core/domain/models/aggregate-root.ts',
        'export function hydrate(aggregate: any) { aggregate.version = 2; }',
      ).status,
    ).toBe(0);
  });
});
