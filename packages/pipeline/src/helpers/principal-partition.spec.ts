/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { principalSegments } from './principal-partition.js';

describe('principalSegments', () => {
  it('trims a single principal into one segment', () => {
    expect(principalSegments(' u-1 ')).toEqual(['u-1']);
  });

  it('keeps the parts of a composite principal in order', () => {
    expect(principalSegments(['user', ' u-1'])).toEqual(['user', 'u-1']);
  });

  it.each([undefined, null, '', '  ', [], ['user', ''], [1 as never]])(
    'reports %j as absent',
    (value) => {
      expect(principalSegments(value)).toBeUndefined();
    },
  );
});
