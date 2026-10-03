/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Relative importance levels of an audited action.
 */
export const AUDIT_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

/**
 * Standard request kinds categorized by the pipeline.
 */
export const AUDIT_REQUEST_KINDS = {
  COMMAND: 'command',
  QUERY: 'query',
  EVENT: 'event',
  UNKNOWN: 'unknown',
} as const;

/**
 * Audit record outcomes. `PENDING` is the outcome of a start record only.
 */
export const AUDIT_OUTCOMES = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  PENDING: 'pending',
} as const;
