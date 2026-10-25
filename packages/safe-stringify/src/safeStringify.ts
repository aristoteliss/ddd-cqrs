/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Placeholder substituted for the value of a redacted field. */
export const REDACTED = '[REDACTED]';

/**
 * Commonly sensitive field names. Redaction matches a key ignoring case, `_`
 * and `-`, so `refreshToken` also masks `refresh_token` and `REFRESH-TOKEN`;
 * a name list cannot recognize every secret, so add application-specific
 * names through `redactKeys`.
 */
export const DEFAULT_REDACT_KEYS: readonly string[] = [
  'password',
  'passwordHash',
  'pass',
  'pwd',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'sessionToken',
  'secret',
  'clientSecret',
  'privateKey',
  'apiKey',
  'xApiKey',
  'authorization',
  'proxyAuthorization',
  'cookie',
  'setCookie',
  'ssn',
  'creditCard',
  'cardNumber',
  'cvv',
];

export interface SanitizeOptions {
  /** Keys or dot-paths to completely exclude from the output (exact, case-sensitive match). */
  excludeKeys?: Set<string> | readonly string[];
  /** Keys or dot-paths to mask with {@link REDACTED}, matched ignoring case, `_` and `-`. */
  redactKeys?: Set<string> | readonly string[];
  /** Replacement string for redacted fields. Default: {@link REDACTED}. */
  redactReplacement?: string;
  /**
   * Sanitization mode:
   * - 'json': normalizes rich types (Date, Map, Set, Error) to JSON-friendly primitives/objects.
   * - 'clone': deeply clones Date, RegExp, Map, Set, and binary values with their classes. An
   *   Error becomes a plain `Error` carrying its name, message, stack, and own enumerable
   *   properties; any other object becomes a plain object.
   */
  mode?: 'json' | 'clone';
}

const SAFE_PRIMITIVES = new Set(['string', 'number', 'boolean']);

interface SanitizerMatchers {
  flatExclude: Set<string>;
  pathExclude: Set<string>;
  flatRedact: Set<string>;
  pathRedact: Set<string>;
  redactReplacement: string;
  mode: 'json' | 'clone';
}

function buildMatchers(
  options?: SanitizeOptions | Set<string>,
): SanitizerMatchers {
  if (options instanceof Set) options = { excludeKeys: options };
  const mode = options?.mode || 'json';
  const redactReplacement = options?.redactReplacement || REDACTED;
  const exclude = partitionKeys(options?.excludeKeys);
  const redact = partitionKeys(options?.redactKeys, normalizeRedactKey);

  return {
    flatExclude: exclude.flat,
    pathExclude: exclude.path,
    flatRedact: redact.flat,
    pathRedact: redact.path,
    redactReplacement,
    mode,
  };
}

/** Splits keys into flat names and dot-paths, after `normalize` maps each one. */
function partitionKeys(
  keys: Iterable<string> | undefined,
  normalize: (key: string) => string = (key) => key,
): { flat: Set<string>; path: Set<string> } {
  const flat = new Set<string>();
  const path = new Set<string>();
  if (!keys) return { flat, path };
  for (const key of keys) {
    const normalized = normalize(key);
    if (normalized.includes('.')) path.add(normalized);
    else flat.add(normalized);
  }
  return { flat, path };
}

function normalizeRedactKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function isRedacted(
  key: string,
  path: string,
  matchers: SanitizerMatchers,
): boolean {
  return (
    matchers.flatRedact.has(normalizeRedactKey(key)) ||
    matchers.pathRedact.has(normalizeRedactKey(path))
  );
}

function isExcluded(
  key: string,
  path: string,
  matchers: SanitizerMatchers,
): boolean {
  return matchers.flatExclude.has(key) || matchers.pathExclude.has(path);
}

/** One sanitization pass: its matchers and the objects above the current value. */
class Sanitizer {
  private readonly ancestors = new WeakSet<object>();

  constructor(private readonly matchers: SanitizerMatchers) {}

  sanitize(val: unknown, path: string): unknown {
    if (val === null) return null;
    if (val === undefined) return undefined;

    // Primitives
    if (typeof val !== 'object' && typeof val !== 'function') {
      if (this.matchers.mode === 'clone') return val;
      const type = typeof val;
      return SAFE_PRIMITIVES.has(type) ? val : `[${type}]`;
    }

    if (typeof val === 'function') {
      return this.matchers.mode === 'clone' ? val : '[Function]';
    }

    // Circular reference guard
    if (this.ancestors.has(val as object)) return '[Circular]';
    this.ancestors.add(val as object);

    try {
      return this.sanitizeObject(val as object, path);
    } finally {
      this.ancestors.delete(val as object);
    }
  }

  private sanitizeObject(val: object, path: string): unknown {
    const isClone = this.matchers.mode === 'clone';

    // 1. Date
    if (val instanceof Date) {
      if (isClone) return new Date(val);
      return Number.isNaN(val.getTime()) ? '[Invalid Date]' : val.toISOString();
    }

    // 2. RegExp
    if (val instanceof RegExp) {
      if (isClone) return cloneRegExp(val);
      return val.toString();
    }

    // 3. Error
    if (val instanceof Error) {
      if (isClone) return this.cloneError(val, path);
      return { name: val.name, message: val.message, stack: val.stack };
    }

    // 4. Binary data
    if (isBinary(val)) {
      if (isClone) return structuredClone(val);
      return '[Binary Data]';
    }

    // 5. Streams
    if (isStream(val)) return '[Stream]';

    // 6. Multer File
    if (isMulterFile(val)) return `[File: ${val.originalname}]`;

    return this.sanitizeCollection(val, path);
  }

  private sanitizeCollection(val: object, path: string): unknown {
    const isClone = this.matchers.mode === 'clone';

    // 7. Map
    if (val instanceof Map) {
      if (isClone) return this.cloneMap(val, path);
      return this.sanitize(Object.fromEntries(val), path);
    }

    // 8. Set
    if (val instanceof Set) {
      if (isClone) {
        return new Set(Array.from(val, (item) => this.sanitize(item, path)));
      }
      return this.sanitize([...val], path);
    }

    // 9. Array
    if (Array.isArray(val)) {
      return val.map((item) => this.sanitize(item, path));
    }

    // 10. Generic Object
    const out: Record<string, unknown> =
      this.matchers.mode === 'json' ? Object.create(null) : {};

    this.copyProperties(val, out, path);

    return out;
  }

  private cloneError(val: Error, path: string): Error {
    const clone = new Error(val.message);
    clone.name = val.name;
    clone.stack = val.stack;
    this.copyProperties(val, clone, path);
    return clone;
  }

  private cloneMap(
    val: Map<unknown, unknown>,
    path: string,
  ): Map<unknown, unknown> {
    const clone = new Map<unknown, unknown>();
    for (const [k, v] of val) {
      const keyStr = typeof k === 'string' ? k : '';
      const currentPath = path && keyStr ? `${path}.${keyStr}` : keyStr;
      if (keyStr && isExcluded(keyStr, currentPath, this.matchers)) continue;
      const isRedact = keyStr
        ? isRedacted(keyStr, currentPath, this.matchers)
        : false;
      clone.set(
        this.sanitize(k, path),
        isRedact
          ? this.matchers.redactReplacement
          : this.sanitize(v, currentPath),
      );
    }
    return clone;
  }

  private copyProperties(source: object, target: object, path: string): void {
    for (const [k, v] of Object.entries(source)) {
      const currentPath = path ? `${path}.${k}` : k;

      if (isExcluded(k, currentPath, this.matchers)) {
        continue;
      }

      const valOut = isRedacted(k, currentPath, this.matchers)
        ? this.matchers.redactReplacement
        : this.sanitize(v, currentPath);

      Object.defineProperty(target, k, {
        value: valOut,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    if (this.matchers.mode !== 'clone') return;
    for (const sym of Object.getOwnPropertySymbols(source)) {
      const descriptor = Object.getOwnPropertyDescriptor(source, sym);
      if (!descriptor?.enumerable) continue;
      Object.defineProperty(target, sym, {
        value: this.sanitize(Reflect.get(source, sym), path),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
}

function cloneRegExp(val: RegExp): RegExp {
  const clone = new RegExp(val.source, val.flags);
  clone.lastIndex = val.lastIndex;
  return clone;
}

function isBinary(val: object): boolean {
  const isBuffer = typeof Buffer !== 'undefined' && Buffer.isBuffer(val);
  return isBuffer || val instanceof ArrayBuffer || ArrayBuffer.isView(val);
}

function isStream(val: object): boolean {
  const candidate = val as Record<string, unknown>;
  return (
    typeof candidate.pipe === 'function' && typeof candidate.on === 'function'
  );
}

/** A Multer upload: an `originalname` beside a `buffer` that is a Buffer. */
function isMulterFile(val: object): val is { originalname: unknown } {
  return (
    'originalname' in val &&
    'buffer' in val &&
    Buffer.isBuffer((val as Record<string, unknown>).buffer)
  );
}

/**
 * Sanitizes a value for structured logging or general processing: handles
 * circular references, non-serializable types, exclusion, and redaction.
 */
export function safeSanitize(
  value: unknown,
  options?: SanitizeOptions | Set<string>,
): unknown {
  const matchers = buildMatchers(options);
  return new Sanitizer(matchers).sanitize(value, '');
}

/**
 * Safely converts a value to a JSON string, handling circular references,
 * non-serializable types, and optional key exclusion/redaction.
 */
export function safeStringify(
  value: unknown,
  options?: SanitizeOptions | Set<string>,
  indent?: number,
): string {
  const sanitized = safeSanitize(value, options);
  return JSON.stringify(sanitized, undefined, indent) ?? 'undefined';
}

/**
 * Returns a copy of `value` with the given keys masked with {@link REDACTED}.
 *
 * Copies in the `'clone'` mode of {@link SanitizeOptions}: Date, RegExp, Map,
 * Set, and binary values keep their classes; an Error becomes a plain `Error`
 * with the same name, message, stack, and own enumerable properties; any other
 * object becomes a plain object. A cyclic reference becomes `'[Circular]'`,
 * streams and Multer files become placeholder strings, and functions are
 * returned by reference.
 */
export function redactValue(
  value: unknown,
  keys: readonly string[] = DEFAULT_REDACT_KEYS,
): unknown {
  return safeSanitize(value, {
    redactKeys: keys,
    mode: 'clone',
  });
}
