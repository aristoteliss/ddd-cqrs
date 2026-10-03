/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  CommandBaseHandler,
  type IQueryRepository,
} from '@cqrs-ddd/core/application';
import { CommandHandler, EventBus, UsePipeline } from '@cqrs-ddd/cqrs';
import { AUDIT_SEVERITY, audit } from '@cqrs-ddd/pipeline-audit';
import { deadLetter } from '@cqrs-ddd/pipeline-deadletter';
import { metrics } from '@cqrs-ddd/pipeline-opentelemetry';
import {
  createPartitionedRateLimitKeyFactory,
  rateLimit,
} from '@cqrs-ddd/pipeline-rate-limit';
import {
  AUDIT_ACTIONS,
  RATE_LIMIT_COST,
} from '../../../../common/constants/index.js';
import { InvalidRefreshTokenError } from '../../../domain/errors/refresh-token.errors.js';
import type { Auth } from '../../../domain/models/auth.entity.js';
import { PrincipalLoginService } from '../../../services/principal-login.service.js';
import { type IRefreshTokens } from '../../ports/refresh-tokens.port.js';
import { type ISessionCookies } from '../../ports/session-cookies.port.js';
import { GetAuthByTokenHashQuery } from '../queries/get-auth-by-token-hash.query.js';
import { RevokeAuthCommand } from './revoke-auth.command.js';

@CommandHandler(RevokeAuthCommand)
@UsePipeline(
  metrics({ meterName: 'users-api.auth' }),
  rateLimit({
    keyFactory: createPartitionedRateLimitKeyFactory(
      (ctx) => (ctx.request as RevokeAuthCommand).clientIp,
    ),
    points: RATE_LIMIT_COST.logout,
  }),
  deadLetter({ redactKeys: ['refreshToken'] }),
  audit({
    action: AUDIT_ACTIONS.AUTH_LOGOUT,
    severity: AUDIT_SEVERITY.LOW,
    redactKeys: ['refreshToken'],
  }),
)
export class RevokeAuthHandler extends CommandBaseHandler<
  RevokeAuthCommand,
  Auth
> {
  constructor(
    protected readonly eventBus: EventBus,
    private readonly authByTokenHash: IQueryRepository<
      GetAuthByTokenHashQuery,
      Auth | null
    >,
    private readonly refreshTokens: IRefreshTokens,
    private readonly cookies: ISessionCookies,
    private readonly principalLoginService: PrincipalLoginService,
  ) {
    super(eventBus);
  }

  async handle({ refreshToken }: RevokeAuthCommand): Promise<Auth> {
    const auth = refreshToken
      ? await this.authByTokenHash.find(
          new GetAuthByTokenHashQuery({
            tokenHash: this.refreshTokens.hash(refreshToken),
          }),
        )
      : null;
    const revoked = auth
      ? await this.principalLoginService.revoke(auth, Date.now())
      : null;

    this.cookies.clear();
    if (!revoked) throw new InvalidRefreshTokenError();
    return revoked;
  }
}
