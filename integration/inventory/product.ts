/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type AggregateRoot,
  ApplyMutation,
  DomainException,
  Mutable,
  numberRule,
  RootDomainEvent,
  RootEntity,
  type RootEntitySnapshot,
  textRule,
} from '@cqrs-ddd/core/domain';
import { rootEntityProperties, versionProperty } from '@cqrs-ddd/mikro-orm';
import { EntitySchema } from '@mikro-orm/core';

/** A sale of more units than the stock holds. */
export class OutOfStockException extends DomainException {}

export interface ProductSnapshot extends Partial<RootEntitySnapshot> {
  readonly sku: string;
  readonly name: string;
  readonly stock: number;
}

/**
 * A product and its stock. `sku` never changes; `name` and `stock` change through
 * domain methods only, and MikroORM hydrates them through private setters.
 *
 * @example
 * ```ts
 * const kettle = Product.register('KTL-1', 'Kettle', 5);
 * kettle.sell(2).stock; // 3
 * ```
 */
export class Product extends RootEntity<ProductSnapshot> {
  static readonly aggregateName = 'product';
  static readonly rules = {
    sku: textRule({ field: 'sku', pattern: /^[A-Z0-9-]{3,20}$/ }),
    name: textRule({ field: 'name', minLength: 1, maxLength: 120 }),
    stock: numberRule({ field: 'stock', integer: true, min: 0 }),
  } as const;

  readonly sku: string;

  @Mutable<string>({ normalize: (value) => Product.rules.name.parse(value) })
  private _name: string;

  @Mutable<number>({ normalize: (value) => Product.rules.stock.parse(value) })
  private _stock: number;

  private constructor(snapshot: ProductSnapshot) {
    super(snapshot);
    this.sku = Product.rules.sku.parse(snapshot.sku);
    this._name = Product.rules.name.parse(snapshot.name);
    this._stock = Product.rules.stock.parse(snapshot.stock);
  }

  static register(sku: string, name: string, stock: number): Product {
    const product = new Product({ sku, name, stock });
    product.apply(new StockChangedEvent(product));
    return product;
  }

  static fromJSON(snapshot: ProductSnapshot): Product {
    return new Product(snapshot);
  }

  get name(): string {
    return this._name;
  }

  private set name(value: string) {
    this._name = Product.rules.name.parse(value);
  }

  get stock(): number {
    return this._stock;
  }

  private set stock(value: number) {
    this._stock = Product.rules.stock.parse(value);
  }

  @ApplyMutation<Product>({
    event: (product) => new StockChangedEvent(product),
  })
  restock(units: number): this {
    this.applyPatch({ stock: this._stock + units });
    return this;
  }

  @ApplyMutation<Product>({
    event: (product) => new StockChangedEvent(product),
  })
  sell(units: number): this {
    if (units > this._stock) {
      throw new OutOfStockException(`Only ${this._stock} of ${this.sku} left.`);
    }
    this.applyPatch({ stock: this._stock - units });
    return this;
  }

  @ApplyMutation<Product>({
    event: (product) => new ProductRenamedEvent(product),
  })
  rename(name: string): this {
    this.applyPatch({ name });
    return this;
  }

  @ApplyMutation<Product>({
    event: (product) => new ProductRetiredEvent(product),
  })
  retire(): this {
    return this;
  }

  toJSON(): ProductSnapshot & RootEntitySnapshot {
    return this.freezeState({
      id: this.id,
      sku: this.sku,
      name: this._name,
      stock: this._stock,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
    });
  }
}

export class StockChangedEvent extends RootDomainEvent<
  Product,
  ProductSnapshot
> {
  constructor(product: Product) {
    super(product);
  }
}

export class ProductRenamedEvent extends RootDomainEvent<
  Product,
  ProductSnapshot
> {
  constructor(product: Product) {
    super(product);
  }
}

export class ProductRetiredEvent extends RootDomainEvent<
  Product,
  ProductSnapshot
> {
  constructor(product: Product) {
    super(product);
  }
}

/** The mapping of {@link Product} to the `products` table. */
export const ProductSchema = new EntitySchema<Product, AggregateRoot>({
  // biome-ignore lint/suspicious/noExplicitAny: Product hides its constructor to keep its invariants.
  class: Product as any,
  tableName: 'products',
  properties: {
    ...rootEntityProperties(),
    version: versionProperty(),
    sku: { type: 'string', length: 20 },
    name: { type: 'string', length: 120, accessor: true },
    stock: { type: 'integer', accessor: true },
  },
  uniques: [{ name: 'products_sku_unique', properties: ['sku'] }],
});
