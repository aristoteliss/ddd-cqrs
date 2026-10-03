/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { setPersistenceDialect } from '@cqrs-ddd/core/persistence';
import {
  type IEntityManagerSource,
  MikroOrmDialect,
  TenantStore,
} from '@cqrs-ddd/mikro-orm';
import { MikroORM } from '@mikro-orm/core';
import type { SqlEntityManager } from '@mikro-orm/sql';
import {
  createLibsqlOrmOptions,
  createPostgresOrmOptions,
  libsqlDbUrl,
} from './orm-options.js';
import { persistenceConfig } from './persistence.config.js';
import type { TenantSchemaContext } from './tenant-schema.context.js';
import { UnknownTenantSchemaError } from './tenant-schema.errors.js';

/**
 * The entity managers of the configured tenants: one libSQL database per tenant, or one
 * PostgreSQL schema per tenant on a shared ORM. `em` and `transactional` act on the
 * tenant of the running request or job.
 *
 * @example
 * ```ts
 * const store = new MikroOrmStore(new TenantSchemaContext(), logger);
 * await store.open();
 * // …
 * await store.close();
 * ```
 */
export class MikroOrmStore implements IEntityManagerSource {
  private readonly orms = new Map<string, MikroORM>();
  private tenants!: TenantStore<SqlEntityManager>;

  constructor(
    private readonly context: TenantSchemaContext,
    private readonly logger?: { info(message: string): void },
  ) {}

  /** Opens an ORM per tenant (libSQL) or one for all (PostgreSQL), from the configuration. */
  async open(): Promise<void> {
    const config = persistenceConfig();
    const isolation = config.engine === 'postgres' ? 'schema' : 'database';
    const shared =
      isolation === 'schema'
        ? await MikroORM.init(createPostgresOrmOptions())
        : undefined;
    for (const tenant of config.tenants) {
      const orm =
        shared ??
        (await MikroORM.init(
          createLibsqlOrmOptions(libsqlDbUrl(tenant, config)),
        ));
      this.orms.set(tenant, orm);
    }
    this.logger?.info(
      `MikroORM initialized: ${config.engine}, a ${isolation} per tenant (${config.tenants.join(', ')})`,
    );
    // Every tenant maps the same entities, so one ORM's metadata serves all.
    const [first] = this.orms.values();
    if (first) setPersistenceDialect(new MikroOrmDialect(first));
    this.tenants = new TenantStore({
      tenant: () => this.context.schema,
      orm: (tenant) => {
        const orm = this.orms.get(tenant);
        if (!orm) throw new UnknownTenantSchemaError(tenant);
        return orm;
      },
      isolation,
    });
  }

  /** Closes every ORM once. */
  async close(): Promise<void> {
    await Promise.all(
      [...new Set(this.orms.values())].map((orm) => orm.close()),
    );
    this.orms.clear();
  }

  get em(): SqlEntityManager {
    return this.tenants.em;
  }

  transactional<T>(work: (em: SqlEntityManager) => Promise<T>): Promise<T> {
    return this.tenants.transactional(work);
  }
}
