/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type IQueryRepository,
  type IWriteSideAggregateRepository,
  requireTenant,
} from '@cqrs-ddd/core/application';
import { ConcurrencyConflictError } from '@cqrs-ddd/core/domain';
import { GetUserQuery } from '../../users/application/cqrs/queries/get-user.query.js';
import { User } from '../../users/domain/models/user.entity.js';
import { GetUserPermissionRulesQuery } from '../application/cqrs/queries/get-user-permission-rules.query.js';
import {
  type AccessTokenIssueResult,
  type IAccessTokenIssuer,
} from '../application/ports/access-token-issuer.port.js';
import { type AuthTokenPolicy } from '../application/ports/auth-token-policy.port.js';
import { type ILoginCodeVerifier } from '../application/ports/login-code-verifier.port.js';
import type { AuthResult } from '../application/results/auth.result.js';
import type { Auth } from '../domain/models/auth.entity.js';
import { InvalidLoginCredentialsException } from '../domain/models/errors/authentication.exception.js';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
} from '../domain/models/errors/refresh-token.errors.js';
import { GetUserPermissionRulesQueryRepository } from '../persistence/get-user-permission-rules.query-repository.js';

/** The refresh token a caller presented, as its digest, and the token that replaces it. */
export interface RefreshTokenRotation {
  readonly presentedHash: string;
  readonly nextToken: string;
  readonly nextHash: string;
}

export class PrincipalLoginService {
  constructor(
    private readonly queryRepository: IQueryRepository<
      GetUserQuery,
      User | null
    >,
    private readonly loginCodeVerifier: ILoginCodeVerifier,
    private readonly accessTokenIssuer: IAccessTokenIssuer,
    private readonly policy: AuthTokenPolicy,
    private readonly permissionRules: GetUserPermissionRulesQueryRepository,
    private readonly authRepository: IWriteSideAggregateRepository<Auth>,
  ) {}

  /**
   * Finds the user by email in primary storage and verifies the login code
   * through `LOGIN_CODE_VERIFIER`.
   *
   * @param email - The claimed email.
   * @param code - The presented login code.
   * @returns The authenticated user.
   * @throws InvalidLoginCredentialsException for an unknown email and for a wrong
   *   code alike, so the answer does not reveal which accounts exist.
   *
   * @example
   * ```ts
   * const user = await this.principalLoginService.authenticate(command.email, command.code);
   * ```
   */
  async authenticate(email: string, code: string): Promise<User> {
    const user = await this.queryRepository.find(
      new GetUserQuery({ email }, { refresh: true }),
    );

    if (!user) {
      throw new InvalidLoginCredentialsException();
    }

    await this.loginCodeVerifier.verify({ userId: user.id, code });

    return user;
  }

  /**
   * Issues an access token for `user` bound to the `Auth` session `sessionId`.
   * When `embedPermissions` is on, it reads the user's rules first and
   * embeds them, so the token carries the rules as they are at issue time.
   *
   * @param user - The authenticated user.
   * @param sessionId - Id of the `Auth` session; the token carries it as `sid`.
   * @returns The token and its expiry as a Unix timestamp in milliseconds.
   *
   * @example
   * ```ts
   * await this.commandRepository.save(auth);
   * const access = await this.principalLoginService.sign(user, auth.id);
   * ```
   */
  async sign(user: User, sessionId: string): Promise<AccessTokenIssueResult> {
    return this.accessTokenIssuer.issue({
      user,
      sessionId,
      ...(this.policy.embedPermissions
        ? {
            permissions: await this.permissionRules.find(
              new GetUserPermissionRulesQuery(
                { userId: user.id },
                { refresh: true },
              ),
            ),
          }
        : {}),
    });
  }

  /**
   * Rotates the refresh token of the session `auth` and issues a new access
   * token, or answers without rotating when the immediately previous token is
   * presented within the reuse grace window. When a concurrent write wins the
   * version check, it reloads the session and tries once more; a reloaded
   * session that no longer knows the presented token is revoked.
   *
   * @param auth - The session the presented token belongs to.
   * @param rotation - The digest of the presented token and its replacement.
   * @returns The refreshed result; it carries `refreshToken` only after a rotation.
   * @throws {InvalidRefreshTokenError} When the session is revoked or expired,
   *   expires while the access token is prepared, or its user or row is gone.
   * @throws {RefreshTokenReuseError} After revoking the session, when a consumed
   *   token is presented outside the grace window.
   * @throws {ConcurrencyConflictError} When the second attempt also loses the version check.
   *
   * @example
   * ```ts
   * const result = await this.principalLoginService.refresh(auth, {
   *   presentedHash,
   *   nextToken,
   *   nextHash: this.refreshTokens.hash(nextToken),
   * });
   * ```
   */
  async refresh(
    auth: Auth,
    rotation: RefreshTokenRotation,
  ): Promise<AuthResult> {
    let session = auth;

    for (let attempt = 0; ; attempt++) {
      try {
        return await this.rotate(session, rotation);
      } catch (error) {
        if (error instanceof RefreshTokenReuseError) {
          await this.revoke(session, Date.now());
          throw error;
        }
        if (!(error instanceof ConcurrencyConflictError) || attempt === 1)
          throw error;
        session = await this.reload(session, rotation.presentedHash);
      }
    }
  }

  /**
   * Persists the revocation of `auth`, reloading it and trying again when a
   * concurrent write wins the version check, for at most three attempts. A
   * session whose revocation is already saved is returned without a write, and
   * the first revocation time is kept.
   *
   * @param auth - The login session to revoke. It may already carry an unsaved
   *   revocation that `Auth.refresh` recorded on token reuse.
   * @param now - Revocation time as a Unix timestamp in milliseconds.
   * @returns The revoked session, or `null` when it was deleted concurrently.
   * @throws ConcurrencyConflictError when all three attempts lose the version check.
   *
   * @example
   * ```ts
   * const revoked = await this.principalLoginService.revoke(auth, Date.now());
   * if (!revoked) throw new InvalidRefreshTokenError();
   * ```
   */
  async revoke(auth: Auth, now: number): Promise<Auth | null> {
    const maxAttempts = 3;
    let current: Auth | null = auth;

    for (let attempt = 0; ; attempt++) {
      if (
        current.revokedAt !== null &&
        current.version === current.getExpectedVersion()
      ) {
        return current;
      }
      current.revoke(now);
      try {
        await this.authRepository.save(current);
        return current;
      } catch (error) {
        if (
          !(error instanceof ConcurrencyConflictError) ||
          attempt === maxAttempts - 1
        )
          throw error;
        current = await this.authRepository.findById(auth.id);
        if (!current) {
          return current;
        }
      }
    }
  }

  private async rotate(
    auth: Auth,
    { presentedHash, nextToken, nextHash }: RefreshTokenRotation,
  ): Promise<AuthResult> {
    const graceMs = this.policy.refreshReuseGraceSeconds * 1000;
    const outcome = auth.refresh(presentedHash, nextHash, Date.now(), graceMs);

    const user = await this.queryRepository.find(
      new GetUserQuery({ userId: auth.userId }, { refresh: true }),
    );
    if (!user) throw new InvalidRefreshTokenError();
    const access = await this.sign(user, auth.id);
    const preparedAt = Date.now();
    if (preparedAt >= auth.expiresAt) throw new InvalidRefreshTokenError();

    if (outcome === 'grace') {
      auth.refresh(presentedHash, nextHash, preparedAt, graceMs);
    } else {
      await this.authRepository.save(auth);
    }

    return {
      aggregate: auth,
      userId: user.id,
      principalType: 'user',
      tenant: requireTenant('refresh'),
      email: user.email,
      department: user.department,
      accessToken: access.accessToken,
      accessTokenExpiresAt: access.expiresAt,
      ...(outcome === 'rotated' ? { refreshToken: nextToken } : {}),
      sessionExpiresAt: auth.expiresAt,
    };
  }

  private async reload(auth: Auth, presentedHash: string): Promise<Auth> {
    const reloaded = await this.authRepository.findById(auth.id);
    if (!reloaded) throw new InvalidRefreshTokenError();
    const isKnown =
      presentedHash === reloaded.refreshTokenHash ||
      presentedHash === reloaded.previousRefreshTokenHash;
    if (isKnown) return reloaded;

    await this.revoke(reloaded, Date.now());
    throw new RefreshTokenReuseError();
  }
}
