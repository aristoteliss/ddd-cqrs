/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Allows `table` or `schema.table` made of unquoted SQL identifiers only. */
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

/**
 * Refuses a table name that is not safe to interpolate into SQL text.
 *
 * A table name cannot be a query parameter, so a Postgres store writes it into
 * the statement. Only `table` or `schema.table` made of unquoted identifiers
 * (letters, digits and `_`, not starting with a digit) passes.
 *
 * @param table - Table name from the store options, optionally schema-qualified.
 * @param purpose - What the table holds, for the error message (e.g. `'audit'`).
 * @param example - A valid table name for the error message (e.g. `'audit_log'`).
 * @returns `table`, unchanged.
 * @throws Error when `table` is not a safe identifier.
 *
 * @example
 * ```ts
 * assertSafeTable('audit.audit_log', 'audit', 'audit_log'); // 'audit.audit_log'
 * assertSafeTable('x; DROP TABLE y', 'audit', 'audit_log'); // throws
 * ```
 */
export function assertSafeTable(
  table: string,
  purpose: string,
  example: string,
): string {
  if (!SAFE_IDENTIFIER.test(table)) {
    throw new Error(
      `Invalid ${purpose} table name "${table}". ` +
        `Use an unquoted identifier like "${example}" or "schema.${example}".`,
    );
  }
  return table;
}
