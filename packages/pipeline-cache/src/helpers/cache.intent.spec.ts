/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { CacheBehavior } from '../cache.behavior.js';
import { type CacheIntentOptions, cache } from './cache.intent.js';

describe('cache intent', () => {
  it('builds the behavior entry with the key factory', () => {
    const factory = () => 'tenant:principal:operation';
    expect(cache({ key: factory })).toEqual([CacheBehavior, { key: factory }]);
  });

  it('leaves the module key unset when inheritance is explicit', () => {
    expect(cache({ inheritModuleKey: true })[1]).toEqual({});
  });

  it('requires a factory or explicit inheritance at compile time', () => {
    expectTypeOf<object>().not.toExtend<CacheIntentOptions>();
    expectTypeOf<{ key: string }>().not.toExtend<CacheIntentOptions>();
    expectTypeOf<{
      inheritModuleKey: false;
    }>().not.toExtend<CacheIntentOptions>();
    expectTypeOf<{
      key: () => string;
      inheritModuleKey: true;
    }>().not.toExtend<CacheIntentOptions>();
  });
});
