/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  ConcurrencyConflictError,
  EntityNotFoundException,
} from '@cqrs-ddd/core/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Inventory, openInventory } from './database.js';
import { OutOfStockException, Product } from './product.js';
import {
  DuplicateSkuException,
  GetProductQuery,
  GetProductRepository,
  productKey,
  RegisterProductRepository,
  RetireProductRepository,
  StockRepository,
} from './repositories.js';

let inventory: Inventory;
let register: RegisterProductRepository;
let stock: StockRepository;
let retire: RetireProductRepository;
let catalog: GetProductRepository;

beforeAll(async () => {
  inventory = await openInventory();
  const { cache, store } = inventory;
  register = new RegisterProductRepository(cache, store);
  stock = new StockRepository(cache, store);
  retire = new RetireProductRepository(cache, store);
  catalog = new GetProductRepository(cache, store);
});

afterAll(async () => {
  await inventory?.close();
});

describe('repositories on the core persistence decorators and MikroORM', () => {
  it('registers a product and serves it from the cache it wrote', async () => {
    const kettle = Product.register('KTL-1', 'Kettle', 5);
    await register.save(kettle);

    expect(kettle.getExpectedVersion()).toBe(1);
    const read = await catalog.find(new GetProductQuery(kettle.id));
    expect(read).toBeInstanceOf(Product);
    expect(read?.toJSON()).toMatchObject({ sku: 'KTL-1', stock: 5 });
    expect(catalog.reads).not.toContain(kettle.id);
  });

  it('maps a duplicate SKU to a domain error', async () => {
    await register.save(Product.register('MUG-1', 'Mug', 3));

    await expect(
      register.save(Product.register('MUG-1', 'Another mug', 1)),
    ).rejects.toBeInstanceOf(DuplicateSkuException);
  });

  it('writes stock over the loaded version and refreshes the cached snapshot', async () => {
    const lamp = Product.register('LMP-1', 'Lamp', 4);
    await register.save(lamp);

    const loaded = await stock.findById(lamp.id);
    await stock.save((loaded as Product).sell(3).rename(' Desk lamp '));

    expect(await inventory.cache.get(productKey(lamp.id))).toMatchObject({
      name: 'Desk lamp',
      stock: 1,
      version: 3,
    });
    expect(
      (await catalog.find(new GetProductQuery(lamp.id, { refresh: true })))
        ?.stock,
    ).toBe(1);
    expect(() => (loaded as Product).sell(5)).toThrow(OutOfStockException);
  });

  it('rejects a write from a copy loaded before another change', async () => {
    const desk = Product.register('DSK-1', 'Desk', 2);
    await register.save(desk);
    const first = (await stock.findById(desk.id)) as Product;
    const second = (await stock.findById(desk.id)) as Product;

    await stock.save(first.restock(1));
    await expect(stock.save(second.sell(1))).rejects.toBeInstanceOf(
      ConcurrencyConflictError,
    );
    expect(second.getExpectedVersion()).toBe(1);
  });

  it('retires a product and fences its cache key', async () => {
    const chair = Product.register('CHR-1', 'Chair', 1);
    await register.save(chair);
    await catalog.find(new GetProductQuery(chair.id));

    const loaded = (await stock.findById(chair.id)) as Product;
    await retire.save(loaded.retire());

    expect(await inventory.cache.get(productKey(chair.id))).toBeUndefined();
    expect(await catalog.find(new GetProductQuery(chair.id))).toBeNull();
    await expect(retire.save(loaded)).rejects.toBeInstanceOf(
      EntityNotFoundException,
    );
  });
});
