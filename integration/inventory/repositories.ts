/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  BaseQuery,
  type ICache,
  type IQueryOptions,
} from '@cqrs-ddd/core/application';
import { DomainException } from '@cqrs-ddd/core/domain';
import {
  Cache,
  CommandRepository,
  cacheKey,
  FromCache,
  MapPersistenceErrors,
  PersistedWrite,
  QueryRepository,
} from '@cqrs-ddd/core/persistence';
import {
  AggregateRepository,
  assertAutocommit,
  type IEntityManagerSource,
  mapPersistenceError,
  optimisticDelete,
  optimisticUpdate,
} from '@cqrs-ddd/mikro-orm';
import { Product, type ProductSnapshot } from './product.js';

/** A second product with a SKU already registered. */
export class DuplicateSkuException extends DomainException {
  constructor(readonly product: Product) {
    super(`SKU ${product.sku} is already registered.`);
  }
}

/** The cache key of one product. */
export const productKey = (id: string) =>
  cacheKey(Product.aggregateName, { id });

/**
 * Inserts a new product, writes its snapshot to the cache and maps a duplicate SKU to
 * {@link DuplicateSkuException}, without naming the database constraint.
 *
 * @example
 * ```ts
 * await new RegisterProductRepository(cache, store).save(Product.register('KTL-1', 'Kettle', 5));
 * ```
 */
export class RegisterProductRepository extends CommandRepository<
  Product,
  ProductSnapshot
> {
  constructor(
    cache: ICache<ProductSnapshot>,
    private readonly store: IEntityManagerSource,
  ) {
    super(cache);
  }

  @PersistedWrite<Product>({
    cache: { setKey: (product) => productKey(product.id) },
    unique: { sku: (product) => new DuplicateSkuException(product) },
  })
  async save(product: Product): Promise<ProductSnapshot> {
    const em = this.store.em;
    assertAutocommit(em, 'registerProduct');
    em.persist(em.create(Product, product));
    await em.flush();
    return product.toJSON();
  }
}

/**
 * Loads the stored product, never the cached one, and writes a change only over the
 * version it was loaded at; the cache then holds the new snapshot.
 *
 * @example
 * ```ts
 * const kettle = await stock.findById(id);
 * await stock.save(kettle.sell(1));
 * ```
 */
export class StockRepository extends AggregateRepository<
  ProductSnapshot,
  Product,
  ProductSnapshot
> {
  constructor(cache: ICache<ProductSnapshot>, store: IEntityManagerSource) {
    super(cache, store, Product, Product.aggregateName, Product.fromJSON);
  }

  @PersistedWrite<Product>({
    cache: { setKey: (product) => productKey(product.id) },
    otherwise: (error, product) =>
      mapPersistenceError(error, `updating Product ${product.id}`),
  })
  async save(product: Product): Promise<ProductSnapshot> {
    const snapshot = product.toJSON();
    await optimisticUpdate(
      this.store.em,
      Product,
      product,
      {
        name: snapshot.name,
        stock: snapshot.stock,
        updatedAt: snapshot.updatedAt,
      },
      'Product',
    );
    return snapshot;
  }
}

/**
 * Deletes a retired product over the version it was loaded at, then fences its cache
 * key so a read that started before the delete cannot cache it again.
 *
 * @example
 * ```ts
 * await new RetireProductRepository(cache, store).save(kettle.retire());
 * ```
 */
export class RetireProductRepository extends AggregateRepository<
  ProductSnapshot,
  Product,
  null
> {
  constructor(cache: ICache<ProductSnapshot>, store: IEntityManagerSource) {
    super(cache, store, Product, Product.aggregateName, Product.fromJSON);
  }

  @Cache<Product, null>({ deleteKeys: (product) => [productKey(product.id)] })
  @MapPersistenceErrors<[Product], Product>({
    entity: ([product]) => product,
    otherwise: (error, product) =>
      mapPersistenceError(error, `retiring Product ${product.id}`),
  })
  async save(product: Product): Promise<null> {
    await optimisticDelete(this.store.em, Product, product, 'Product');
    return null;
  }
}

export class GetProductQuery extends BaseQuery {
  constructor(
    readonly id: string,
    options?: IQueryOptions,
  ) {
    super(options);
  }
}

/**
 * Reads a product through the cache: a hit is rehydrated into a `Product`, a miss reads
 * the database and fills the cache only if no write changed the key meanwhile.
 *
 * @example
 * ```ts
 * const kettle = await catalog.find(new GetProductQuery(id));
 * ```
 */
export class GetProductRepository extends QueryRepository<
  GetProductQuery,
  Product | null
> {
  readonly reads: string[] = [];

  constructor(
    cache: ICache<ProductSnapshot>,
    private readonly store: IEntityManagerSource,
  ) {
    super(cache, {
      hydrateFn: (cached) => Product.fromJSON(cached as ProductSnapshot),
    });
  }

  @FromCache<GetProductQuery, Product | null>({
    keyFn: (query) => productKey(query.id),
  })
  async find(query: GetProductQuery): Promise<Product | null> {
    this.reads.push(query.id);
    return this.store.em.findOne(
      Product,
      { id: query.id },
      query.refresh ? { refresh: true } : undefined,
    );
  }
}
