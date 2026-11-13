/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  CommandBaseHandler,
  type IQueryRepository,
} from '@cqrs-ddd/core/application';
import { CommandHandler, EventBus } from '@cqrs-ddd/cqrs';
import { SkipPipeline, UsePipeline } from '@cqrs-ddd/pipeline';
import { AUDIT_SEVERITY, audit } from '@cqrs-ddd/pipeline-audit';
import { DeadLetterBehavior } from '@cqrs-ddd/pipeline-deadletter';
import {
  createPartitionedRateLimitKeyFactory,
  rateLimit,
} from '@cqrs-ddd/pipeline-rate-limit';
import {
  AUDIT_ACTIONS,
  RATE_LIMIT_COST,
} from '../../../../common/constants/index.js';
import { retryOnConflict } from '../../../../common/resilience/conflict-retry.js';
import type { Auth } from '../../../domain/models/auth.entity.js';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
} from '../../../domain/models/errors/refresh-token.errors.js';
import { PrincipalLoginService } from '../../../services/principal-login.service.js';
import { type IRefreshTokens } from '../../ports/refresh-tokens.port.js';
import type { AuthResult } from '../../results/auth.result.js';
import { GetAuthByConsumedTokenHashQuery } from '../queries/get-auth-by-consumed-token-hash.query.js';
import { GetAuthByTokenHashQuery } from '../queries/get-auth-by-token-hash.query.js';
import { RefreshAuthCommand } from './refresh-auth.command.js';

@CommandHandler(RefreshAuthCommand)
@SkipPipeline(DeadLetterBehavior)
@UsePipeline(
  rateLimit({
    keyFactory: createPartitionedRateLimitKeyFactory<RefreshAuthCommand>(
      (ctx) => ctx.request.clientIp,
    ),
    points: RATE_LIMIT_COST.refresh,
  }),
  audit({
    action: AUDIT_ACTIONS.AUTH_REFRESH,
    severity: AUDIT_SEVERITY.LOW,
    redactKeys: ['refreshToken'],
  }),
  retryOnConflict(),
)
export class RefreshAuthHandler extends CommandBaseHandler<
  RefreshAuthCommand,
  AuthResult
> {
  constructor(
    protected readonly eventBus: EventBus,
    private readonly authByTokenHash: IQueryRepository<
      GetAuthByTokenHashQuery,
      Auth | null
    >,
    private readonly authByConsumedTokenHash: IQueryRepository<
      GetAuthByConsumedTokenHashQuery,
      Auth | null
    >,
    private readonly refreshTokens: IRefreshTokens,
    private readonly principalLoginService: PrincipalLoginService,
  ) {
    super(eventBus);
  }

  async handle({ refreshToken }: RefreshAuthCommand): Promise<AuthResult> {
    try {
      return await this.rotate(refreshToken);
    } catch (error) {
      if (error instanceof RefreshTokenReuseError && error.revoked) {
        await this.publishEvents(error.revoked);
      }
      throw error;
    }
  }

  private async rotate(refreshToken: string): Promise<AuthResult> {
    const presentedHash = this.refreshTokens.hash(refreshToken);
    const auth = await this.findSession(presentedHash, Date.now());

    const nextToken = this.refreshTokens.generate();

    return this.principalLoginService.refresh(auth, {
      presentedHash,
      nextToken,
      nextHash: this.refreshTokens.hash(nextToken),
    });
  }

  private async findSession(presentedHash: string, now: number): Promise<Auth> {
    const auth = await this.authByTokenHash.find(
      new GetAuthByTokenHashQuery({ tokenHash: presentedHash }),
    );
    if (auth) return auth;

    const reused = await this.authByConsumedTokenHash.find(
      new GetAuthByConsumedTokenHashQuery({ tokenHash: presentedHash }),
    );
    if (!reused) throw new InvalidRefreshTokenError();
    throw new RefreshTokenReuseError(
      await this.principalLoginService.revoke(reused, now),
    );
  }
}
