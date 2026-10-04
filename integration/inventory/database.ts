/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { setTenantResolver } from '@cqrs-ddd/core/application';
import { setPersistenceDialect } from '@cqrs-ddd/core/persistence';
import {
  CacheEntrySchema,
  createCacheTableSql,
  MikroOrmCache,
  MikroOrmDialect,
} from '@cqrs-ddd/mikro-orm';
import type { EntityManager } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/libsql';
import { ProductSchema, type ProductSnapshot } from './product.js';

const PRODUCTS_TABLE = `create table products (
  id text primary key,
  created_at integer not null,
  updated_at integer not null,
  version integer not null default 1,
  sku text not null,
  name text not null,
  stock integer not null
)`;
const PRODUCTS_SKU_UNIQUE =
  'create unique index products_sku_unique on products (sku)';

/** The open inventory database, its cache and how to close both. */
export interface Inventory {
  readonly orm: MikroORM;
  readonly store: {
    readonly em: EntityManager;
    transactional<T>(work: (em: EntityManager) => Promise<T>): Promise<T>;
  };
  readonly cache: MikroOrmCache<ProductSnapshot>;
  close(): Promise<void>;
}

/**
 * Opens the inventory on an in-memory SQLite database: the composition root of the
 * example. It creates the tables as a migration would, registers the dialect that reads
 * unique violations and the tenant of this single-tenant deployment, and keeps the
 * repository cache in the same database.
 *
 * @example
 * ```ts
 * const inventory = await openInventory();
 * const products = new RegisterProductRepository(inventory.cache, inventory.store);
 * await inventory.close();
 * ```
 */
export async function openInventory(): Promise<Inventory> {
  const orm = await MikroORM.init({
    dbName: ':memory:',
    entities: [ProductSchema, CacheEntrySchema],
    debug: false,
  });
  const connection = orm.em.getConnection();
  await connection.execute(PRODUCTS_TABLE);
  await connection.execute(PRODUCTS_SKU_UNIQUE);
  await connection.execute(createCacheTableSql());
  setPersistenceDialect(new MikroOrmDialect(orm));
  setTenantResolver(() => 'single');

  const store = {
    get em() {
      return orm.em.fork();
    },
    transactional: <T>(work: (em: EntityManager) => Promise<T>) =>
      orm.em.fork().transactional(work),
  };
  return {
    orm,
    store,
    cache: new MikroOrmCache<ProductSnapshot>(store),
    async close() {
      setTenantResolver(undefined);
      setPersistenceDialect(undefined);
      await orm.close(true);
    },
  };
}
