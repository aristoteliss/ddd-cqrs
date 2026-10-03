/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Session settings the handlers apply, bound at startup from
 * `auth-token.config.ts`, so application code never reads the environment.
 */
export interface AuthTokenPolicy {
  readonly refreshTokenTtlSeconds: number;
  readonly refreshReuseGraceSeconds: number;
  readonly embedPermissions: boolean;
}
