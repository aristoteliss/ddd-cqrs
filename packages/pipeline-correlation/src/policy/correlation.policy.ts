/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  DEFAULT_CORRELATION_ID_MAX_LENGTH,
  DEFAULT_CORRELATION_ID_PATTERN,
} from '../options/correlation.options.js';

/** Why an incoming correlation id was rejected. */
export type CorrelationRejectionReason =
  | 'not-string'
  | 'too-long'
  | 'invalid-character'
  | 'surrounding-space'
  | 'rule';

/** An incoming correlation id that was replaced, as `onRejected` receives it. */
export interface CorrelationRejection {
  reason: CorrelationRejectionReason;
  /**
   * Where the id arrived: `'http'` for `httpCorrelation`, `'Class.method'` for a
   * `@WithCorrelation` method, `'runWithCorrelationId'` for a direct call.
   */
  source: string;
  /**
   * The rejected value's length in characters, `0` when it is not a string. The value
   * itself is withheld, so a forged id never reaches a log through this report.
   */
  length: number;
}

/** The rules every incoming correlation id must pass, set with {@link configureCorrelation}. */
export interface CorrelationPolicy {
  /**
   * The longest incoming id accepted, in characters.
   *
   * @default 128
   */
  maxLength?: number;

  /**
   * The application's rule for incoming ids. It replaces the
   * {@link DEFAULT_CORRELATION_ID_PATTERN} test and sees only ids that pass the built-in
   * check and `maxLength`; returning `false` or throwing rejects the id. It must accept
   * the UUIDv7 ids `correlationSource.create()` makes, because the jobs a request
   * enqueues and the services it calls receive them.
   */
  validateIncoming?: (correlationId: string) => boolean;

  /**
   * Called once, synchronously, for each incoming id that is replaced. An error it
   * throws is ignored, so a failing report never fails the work.
   */
  onRejected?: (rejection: CorrelationRejection) => void;
}

/** The two rules an entry point can replace for itself. */
type Rules = Required<Omit<CorrelationPolicy, 'onRejected'>>;

/**
 * `'checked'`: the entry points that applied the default rule before
 * `configureCorrelation` existed, `httpCorrelation` and `correlationSource.accepts`.
 * `'unchecked'`: those that stored any id, `runWithCorrelationId` and `@WithCorrelation`.
 */
export type EntryPoint = 'checked' | 'unchecked';

const PRINTABLE_ASCII = /^[\x20-\x7E]*$/;

const matchesDefaultPattern = (id: string) =>
  DEFAULT_CORRELATION_ID_PATTERN.test(id);

const DEFAULT_RULES: Rules = {
  maxLength: DEFAULT_CORRELATION_ID_MAX_LENGTH,
  validateIncoming: matchesDefaultPattern,
};

const BUILT_IN_CHECK_ONLY: Rules = {
  maxLength: Number.POSITIVE_INFINITY,
  validateIncoming: () => true,
};

let configured: Rules | undefined;
let onRejected: CorrelationPolicy['onRejected'];

/**
 * Sets the rules every incoming correlation id must pass, for the whole process:
 * `httpCorrelation`, `runWithCorrelationId`, `@WithCorrelation` and
 * `correlationSource.accepts`, which job contexts use. Call it once at startup, before
 * the first request. Each call replaces every rule.
 *
 * Until it is called, `httpCorrelation` and `correlationSource.accepts` apply the
 * default rules, and `runWithCorrelationId` and `@WithCorrelation` apply only the
 * built-in check. Once it is called, even with an empty policy, every entry point
 * applies its rules. A call without a policy restores the state before the first call.
 *
 * Whatever the rules, an id must first be printable ASCII (0x20 to 0x7E) that neither
 * starts nor ends with a space, and nothing turns that check off. A rejected id is
 * replaced by the current or a new one and reported to `onRejected`; a missing or empty
 * id is replaced without a report. The `maxLength` and `validateIncoming` options of
 * `httpCorrelation`, when given, replace these rules for that middleware.
 *
 * @param policy - The rules; an omitted field takes its default. Omit the policy to
 *   restore the state before the first call.
 * @throws {TypeError} When `maxLength` is not a positive safe integer.
 * @example
 * ```ts
 * configureCorrelation({
 *   validateIncoming: (id) => /^[0-9a-f-]{36}$/i.test(id),
 *   onRejected: ({ reason, source, length }) =>
 *     logger.warn({ reason, source, length }, 'correlation id replaced'),
 * });
 * ```
 */
export function configureCorrelation(policy?: CorrelationPolicy): void {
  if (policy === undefined) {
    configured = undefined;
    onRejected = undefined;
    return;
  }

  assertMaxLength(policy.maxLength);
  configured = {
    maxLength: policy.maxLength ?? DEFAULT_RULES.maxLength,
    validateIncoming: policy.validateIncoming ?? DEFAULT_RULES.validateIncoming,
  };
  onRejected = policy.onRejected;
}

/** Throws unless `maxLength` is absent or a positive safe integer. */
export function assertMaxLength(maxLength: number | undefined): void {
  if (
    maxLength !== undefined &&
    (!Number.isSafeInteger(maxLength) || maxLength <= 0)
  ) {
    throw new TypeError(
      'Correlation maxLength must be a positive safe integer when provided.',
    );
  }
}

/** Whether `id` is printable ASCII that neither starts nor ends with a space. */
export function isPortable(id: unknown): id is string {
  return typeof id === 'string' && id !== '' && defectOf(id) === undefined;
}

/** Whether the rules of a checked entry point accept `id`; reports nothing. */
export function isAccepted(id: string): boolean {
  return id !== '' && rejectionOf(id, rulesFor('checked')) === undefined;
}

/**
 * Returns `id` when the rules of `entryPoint` accept it. Otherwise returns `undefined`
 * and, unless `id` is missing or empty, reports the rejection as coming from `source`.
 */
export function admit(
  id: unknown,
  source: string,
  entryPoint: EntryPoint,
  overrides?: Partial<Rules>,
): string | undefined {
  if (id === undefined || id === null || id === '') return undefined;

  const rules = rulesFor(entryPoint);
  const reason = rejectionOf(id, {
    maxLength: overrides?.maxLength ?? rules.maxLength,
    validateIncoming: overrides?.validateIncoming ?? rules.validateIncoming,
  });
  if (reason === undefined) return id as string;

  report({
    reason,
    source,
    length: typeof id === 'string' ? id.length : 0,
  });
  return undefined;
}

function rulesFor(entryPoint: EntryPoint): Rules {
  if (configured !== undefined) return configured;

  return entryPoint === 'checked' ? DEFAULT_RULES : BUILT_IN_CHECK_ONLY;
}

function rejectionOf(
  id: unknown,
  { maxLength, validateIncoming }: Rules,
): CorrelationRejectionReason | undefined {
  if (typeof id !== 'string') return 'not-string';
  if (id.length > maxLength) return 'too-long';

  return defectOf(id) ?? (passes(validateIncoming, id) ? undefined : 'rule');
}

function defectOf(
  id: string,
): 'invalid-character' | 'surrounding-space' | undefined {
  if (!PRINTABLE_ASCII.test(id)) return 'invalid-character';
  if (id.startsWith(' ') || id.endsWith(' ')) return 'surrounding-space';
  return undefined;
}

function passes(validate: (id: string) => boolean, id: string): boolean {
  try {
    return validate(id);
  } catch {
    return false;
  }
}

function report(rejection: CorrelationRejection): void {
  try {
    onRejected?.(rejection);
  } catch {
    // A failing report must not fail the request or message it describes.
  }
}
