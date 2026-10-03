/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** `context.items` key holding the ability `CaslBehavior` built for the execution. */
export const CASL_ABILITY_KEY = Symbol.for('@cqrs-ddd/pipeline-casl:ability');

/** `context.items` key holding the principal that ability was built for. */
export const CASL_PRINCIPAL_KEY = Symbol.for(
  '@cqrs-ddd/pipeline-casl:principal',
);

/**
 * Built-in CASL keyword subjects.
 */
export const CASL_SUBJECTS = {
  /** Wildcard subject matching any entity type. */
  ALL: 'all',
} as const;

export type CaslSubject = (typeof CASL_SUBJECTS)[keyof typeof CASL_SUBJECTS];

/**
 * Standard CASL actions, including built-in wildcard and standard CRUD verbs.
 */
export const CASL_ACTIONS = {
  /** Built-in CASL wildcard action matching any operation. */
  MANAGE: 'manage',
  /** Standard CRUD create action. */
  CREATE: 'create',
  /** Standard CRUD read/retrieve action. */
  READ: 'read',
  /** Standard CRUD update action. */
  UPDATE: 'update',
  /** Standard CRUD delete action. */
  DELETE: 'delete',
} as const;

export type CaslAction = (typeof CASL_ACTIONS)[keyof typeof CASL_ACTIONS];
