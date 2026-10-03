/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { REQUEST_KIND } from './create-pipeline.js';

describe('REQUEST_KIND', () => {
  it('uses the key that @cqrs-ddd/core brands its requests with, shared through Symbol.for', () => {
    expect(REQUEST_KIND).toBe(Symbol.for('@cqrs-ddd/request-kind'));
  });
});
