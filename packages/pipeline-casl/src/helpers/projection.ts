/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { AppAbility } from '../types/casl.types.js';

type FieldRule = ReturnType<AppAbility['relevantRuleFor']>;
const OMIT = Symbol('unreadable-field');
const MAX_PATH_ALIASES = 1024;

/** Defines an own data property, so a `__proto__` key stays a plain field. */
function defineField(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

/** A snapshot to project, with the ability, action and CASL subject that decide its fields. */
interface ProjectionRequest {
  ability: AppAbility;
  action: string;
  typedSubject: string;
  record: Record<string, unknown> | unknown[];
}

/**
 * Projects a snapshot to the fields `ability` permits for `action`. Conditions
 * are evaluated against the full subject. A granted parent path authorizes its
 * descendants unless a descendant is explicitly denied; this differs from
 * `ability.can(action, subject, 'parent.child')`, which needs
 * `parent.*`/`parent.**`. Denied array elements become `null`. Cyclic input
 * and more than 1024 path aliases throw.
 */
export function projectPermittedFields({
  ability,
  action,
  typedSubject,
  record,
}: ProjectionRequest): Record<string, unknown> | unknown[] {
  return new FieldProjection(ability, action, typedSubject).projectSnapshot(
    record,
  );
}

/** One projection: the decision it applies and the objects above the current value. */
class FieldProjection {
  private readonly ancestors = new WeakSet<object>();

  constructor(
    private readonly ability: AppAbility,
    private readonly action: string,
    private readonly typedSubject: string,
  ) {}

  projectSnapshot(
    record: Record<string, unknown> | unknown[],
  ): Record<string, unknown> | unknown[] {
    if (Array.isArray(record)) return this.projectItems(record);

    return this.projectFields(record);
  }

  private projectItems(record: unknown[]): unknown[] {
    this.ancestors.add(record);
    try {
      return record.map((item, index) => {
        // The empty path gives named fields the same meaning for every item.
        const projected = this.project(item, ['', String(index)], null);
        return projected === OMIT ? null : projected;
      });
    } finally {
      this.ancestors.delete(record);
    }
  }

  private projectFields(
    record: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.ancestors.add(record);
    try {
      for (const [key, value] of Object.entries(record)) {
        const projected = this.project(value, [key], null);
        if (projected !== OMIT) defineField(result, key, projected);
      }
      return result;
    } finally {
      this.ancestors.delete(record);
    }
  }

  // Evaluate full field paths using CASL. Conditions use the complete subject.
  private ruleFor(paths: string[], inherited: FieldRule): FieldRule {
    let rule: FieldRule = null;
    for (const field of paths) {
      if (!field) continue;
      rule = preferredRule(
        rule,
        this.ability.relevantRuleFor(this.action, this.typedSubject, field),
      );
    }

    // A direct leaf denial always takes precedence over an inherited grant.
    if (rule?.inverted) {
      return rule;
    }

    // Parent denials can mask containers unless explicitly overridden.
    if (inherited?.inverted && (!rule || inherited.priority < rule.priority)) {
      return inherited;
    }

    if (rule) {
      return rule;
    }

    // Inherit parent grant for descendants that are not explicitly denied.
    if (inherited && !inherited.inverted) {
      return inherited;
    }

    return null;
  }

  private project(
    value: unknown,
    paths: string[],
    inherited: FieldRule,
  ): unknown {
    const rule = this.ruleFor(paths, inherited);
    if (value === null || typeof value !== 'object' || value instanceof Date) {
      return permits(rule) ? value : OMIT;
    }

    if (this.ancestors.has(value)) {
      throw new TypeError('Cannot project a cyclic authorization snapshot.');
    }
    this.ancestors.add(value);
    try {
      const toJSON = (value as { toJSON?: unknown }).toJSON;
      if (typeof toJSON === 'function') {
        return this.project(toJSON.call(value), paths, rule);
      }
      if (Array.isArray(value)) return this.projectArray(value, paths, rule);
      return this.projectRecord(value, paths, rule);
    } finally {
      this.ancestors.delete(value);
    }
  }

  private projectArray(
    value: unknown[],
    paths: string[],
    rule: FieldRule,
  ): unknown {
    if (value.length === 0) return permits(rule) ? [] : OMIT;
    let visible = false;
    const result = value.map((item, index) => {
      const projected = this.project(item, elementPaths(paths, index), rule);
      if (projected !== OMIT) visible = true;
      return projected === OMIT ? null : projected;
    });
    return visible ? result : OMIT;
  }

  private projectRecord(
    value: object,
    paths: string[],
    rule: FieldRule,
  ): unknown {
    const entries = Object.entries(value);
    if (entries.length === 0) return permits(rule) ? {} : OMIT;
    const result: Record<string, unknown> = {};
    for (const [key, child] of entries) {
      const projected = this.project(
        child,
        paths.map((path) => (path ? `${path}.${key}` : key)),
        rule,
      );
      if (projected !== OMIT) defineField(result, key, projected);
    }
    return Object.keys(result).length > 0 ? result : OMIT;
  }
}

function permits(rule: FieldRule): boolean {
  return !!rule && !rule.inverted;
}

/**
 * The stronger of the rule chosen so far and a candidate: a denial outranks a
 * grant, and between two of a kind the lower `priority` wins; a tie keeps the
 * current rule.
 */
function preferredRule(current: FieldRule, candidate: FieldRule): FieldRule {
  if (!candidate) return current;
  if (candidate.inverted) {
    return !current?.inverted || candidate.priority < current.priority
      ? candidate
      : current;
  }
  return !current ||
    (!current.inverted && candidate.priority < current.priority)
    ? candidate
    : current;
}

function elementPaths(paths: string[], index: number): string[] {
  // Named paths apply to every element; indexed paths can additionally
  // restrict individual elements. Keep positions stable after masking.
  const aliases = [
    ...new Set([
      ...paths,
      ...paths.map((path) => (path ? `${path}.${index}` : String(index))),
    ]),
  ];
  // Nested arrays have both named and indexed aliases. Bound their
  // combinations so pathological input fails closed instead of exploding.
  if (aliases.length > MAX_PATH_ALIASES) {
    throw new TypeError(
      'Authorization snapshot has too many array path aliases.',
    );
  }
  return aliases;
}
