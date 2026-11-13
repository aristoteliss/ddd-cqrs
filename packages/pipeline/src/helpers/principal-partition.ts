/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * The principal segments of a partitioned key: each value trimmed, or `undefined`
 * when the principal is absent or one of its parts is empty. The caller decides
 * what an absent principal means: an error, a skipped key or a shared bucket.
 *
 * @param value - The caller's identifier, or its parts, such as `[type, id]`.
 *
 * @example
 * ```ts
 * principalSegments(' u-1 '); // ['u-1']
 * principalSegments(['user', 'u-1']); // ['user', 'u-1']
 * principalSegments(['user', '']); // undefined
 * ```
 */
export function principalSegments(
  value: string | readonly string[] | undefined | null,
): string[] | undefined {
  const segments = (typeof value === 'string' ? [value] : (value ?? [])).map(
    (segment) => (typeof segment === 'string' ? segment.trim() : ''),
  );
  return segments.length > 0 && segments.every((segment) => segment !== '')
    ? segments
    : undefined;
}
