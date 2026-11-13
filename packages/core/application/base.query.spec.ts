/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { BaseQuery } from './base.query.js';

class TestUserQuery extends BaseQuery<{ id: string; role: string }> {
  id: string;
  filter?: string;

  constructor(
    payload: { id: string; filter?: string },
    options?: { hydrate?: boolean },
    sessionPrincipal?: { id: string; role: string },
  ) {
    super(options, sessionPrincipal);
    this.id = payload.id;
    this.filter = payload.filter;
  }
}

describe('BaseQuery', () => {
  it('stores hydrate and sessionPrincipal as non-enumerable properties', () => {
    const sessionPrincipal = { id: 'usr-1', role: 'admin' };
    const query = new TestUserQuery(
      { id: '123', filter: 'active' },
      { hydrate: true },
      sessionPrincipal,
    );

    expect(query.hydrate).toBe(true);
    expect(query.sessionPrincipal).toBe(sessionPrincipal);

    const keys = Object.keys(query);
    expect(keys).toContain('id');
    expect(keys).toContain('filter');
    expect(keys).not.toContain('hydrate');
    expect(keys).not.toContain('sessionPrincipal');
  });

  it('defaults hydrate to false when options are omitted', () => {
    const query = new TestUserQuery({ id: '123' });
    expect(query.hydrate).toBe(false);
    expect(query.sessionPrincipal).toBeUndefined();
  });

  it('serializes only defined enumerable payload fields via toJSON()', () => {
    const sessionPrincipal = { id: 'usr-1', role: 'admin' };
    const queryWithFilter = new TestUserQuery(
      { id: '123', filter: 'active' },
      { hydrate: true },
      sessionPrincipal,
    );

    expect(queryWithFilter.toJSON()).toEqual({
      id: '123',
      filter: 'active',
    });

    const queryWithoutFilter = new TestUserQuery(
      { id: '456', filter: undefined },
      { hydrate: false },
    );

    expect(queryWithoutFilter.toJSON()).toEqual({
      id: '456',
    });
  });
});
