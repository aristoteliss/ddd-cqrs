/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { RateLimitBehavior } from '../rate-limit.behavior.js';
import { type RateLimitIntentOptions, rateLimit } from './rate-limit.intent.js';

describe('rateLimit intent', () => {
  it('builds the behavior entry with the key factory', () => {
    const factory = () => 'tenant:principal:operation';
    expect(rateLimit({ keyFactory: factory })).toEqual([
      RateLimitBehavior,
      { keyFactory: factory },
    ]);
  });

  it('leaves the module key unset when inheritance is explicit', () => {
    expect(rateLimit({ inheritModuleKey: true })[1]).toEqual({});
  });

  it('requires a factory or explicit inheritance at compile time', () => {
    expectTypeOf<object>().not.toExtend<RateLimitIntentOptions>();
    expectTypeOf<{
      keyFactory: string;
    }>().not.toExtend<RateLimitIntentOptions>();
    expectTypeOf<{
      inheritModuleKey: false;
    }>().not.toExtend<RateLimitIntentOptions>();
    expectTypeOf<{
      keyFactory: () => string;
      inheritModuleKey: true;
    }>().not.toExtend<RateLimitIntentOptions>();
  });
});
