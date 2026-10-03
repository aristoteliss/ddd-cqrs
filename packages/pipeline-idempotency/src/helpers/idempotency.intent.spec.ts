/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { IdempotencyBehavior } from '../idempotency.behavior.js';
import {
  type IdempotencyIntentOptions,
  idempotent,
} from './idempotency.intent.js';

describe('idempotent intent', () => {
  it('builds the behavior entry with the key factory', () => {
    const factory = () => 'tenant:principal:operation';
    expect(idempotent({ keyFactory: factory })).toEqual([
      IdempotencyBehavior,
      { keyFactory: factory },
    ]);
  });

  it('leaves the module key unset when inheritance is explicit', () => {
    expect(idempotent({ inheritModuleKey: true })[1]).toEqual({});
  });

  it('requires a factory or explicit inheritance at compile time', () => {
    expectTypeOf<object>().not.toExtend<IdempotencyIntentOptions>();
    expectTypeOf<{
      keyFactory: string;
    }>().not.toExtend<IdempotencyIntentOptions>();
    expectTypeOf<{
      inheritModuleKey: false;
    }>().not.toExtend<IdempotencyIntentOptions>();
    expectTypeOf<{
      keyFactory: () => string;
      inheritModuleKey: true;
    }>().not.toExtend<IdempotencyIntentOptions>();
  });
});
