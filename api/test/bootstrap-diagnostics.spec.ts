/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  CommandHandler,
  type Cqrs,
  type CqrsOptions,
  createCqrs,
  type ICommandHandler,
  type IQueryHandler,
  QueryHandler,
  UsePipeline,
} from '@cqrs-ddd/cqrs';
import { PipelineConfigurationError } from '@cqrs-ddd/pipeline';
import { buildCache, CacheBehavior } from '@cqrs-ddd/pipeline-cache';
import { CaslBehavior } from '@cqrs-ddd/pipeline-casl';
import {
  IdempotencyBehavior,
  MemoryIdempotencyStore,
} from '@cqrs-ddd/pipeline-idempotency';
import { RateLimitBehavior } from '@cqrs-ddd/pipeline-rate-limit';
import { ResilienceBehavior } from '@cqrs-ddd/pipeline-resilience';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { describe, expect, it, vi } from 'vitest';

class DummyCommand {
  constructor(readonly id: string = 'cmd-1') {}
}

class DummyQuery {
  constructor(readonly id: string = 'query-1') {}
}

const silent = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
const casl = () => new CaslBehavior({ load: async () => null });
const cache = () =>
  new CacheBehavior(buildCache({ store: { type: 'memory' } }));
const idempotency = () => new IdempotencyBehavior(new MemoryIdempotencyStore());

/** Builds the buses with `options` and registers `handlers`, where diagnostics run. */
function start(options: CqrsOptions, ...handlers: object[]): Cqrs {
  const cqrs = createCqrs({
    logger: silent,
    bootstrapLogLevel: 'none',
    diagnostics: 'strict',
    ...options,
  });
  cqrs.register(...handlers);
  return cqrs;
}

describe('Pipeline registration diagnostics', () => {
  describe('Safety ordering enforcement', () => {
    @QueryHandler(DummyQuery)
    @UsePipeline(
      [CacheBehavior, { key: () => 'cache-key' }],
      [CaslBehavior, {}],
    )
    class MisorderedQueryHandler implements IQueryHandler<DummyQuery> {
      async execute(_query: DummyQuery): Promise<string> {
        return 'executed';
      }
    }

    @CommandHandler(DummyCommand)
    @UsePipeline(
      [CacheBehavior, { key: () => 'cache-key' }],
      [CaslBehavior, {}],
    )
    class InactiveCacheCommandHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    @CommandHandler(DummyCommand)
    @UsePipeline(
      [CacheBehavior, { key: () => 'cache-key', kinds: ['command'] }],
      [CaslBehavior, {}],
    )
    class ExplicitCacheCommandHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('fails at register() when CacheBehavior precedes CaslBehavior on queries in strict mode', () => {
      expect(() =>
        start({ behaviors: [cache(), casl()] }, new MisorderedQueryHandler()),
      ).toThrow(PipelineConfigurationError);
    });

    it('includes handler name, behavior name, and remediation fix in the error message', () => {
      expect(() =>
        start({ behaviors: [cache(), casl()] }, new MisorderedQueryHandler()),
      ).toThrowError(
        /MisorderedQueryHandler.*CacheBehavior.*must execute after.*CaslBehavior/,
      );
    });

    it('allows CacheBehavior before CaslBehavior on commands when cache defaults to queries', () => {
      expect(() =>
        start(
          { behaviors: [cache(), casl()] },
          new InactiveCacheCommandHandler(),
        ),
      ).not.toThrow();
    });

    it('enforces CacheBehavior order on commands when explicitly configured in kinds', () => {
      expect(() =>
        start(
          { behaviors: [cache(), casl()] },
          new ExplicitCacheCommandHandler(),
        ),
      ).toThrow(PipelineConfigurationError);
    });

    @CommandHandler(DummyCommand)
    @UsePipeline(
      [IdempotencyBehavior, { keyFactory: () => 'idemp-key' }],
      [CaslBehavior, {}],
    )
    class MisorderedIdempotencyCommandHandler
      implements ICommandHandler<DummyCommand>
    {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    @QueryHandler(DummyQuery)
    @UsePipeline(
      [IdempotencyBehavior, { keyFactory: () => 'idemp-key' }],
      [CaslBehavior, {}],
    )
    class InactiveIdempotencyQueryHandler implements IQueryHandler<DummyQuery> {
      async execute(_query: DummyQuery): Promise<string> {
        return 'executed';
      }
    }

    it('fails fast when IdempotencyBehavior precedes CaslBehavior on scoped command handlers', () => {
      expect(() =>
        start(
          { behaviors: [idempotency(), casl()] },
          new MisorderedIdempotencyCommandHandler(),
        ),
      ).toThrow(PipelineConfigurationError);
    });

    it('allows IdempotencyBehavior before CaslBehavior on queries when out of default scope', () => {
      expect(() =>
        start(
          { behaviors: [idempotency(), casl()] },
          new InactiveIdempotencyQueryHandler(),
        ),
      ).not.toThrow();
    });
  });

  describe('Policy option validation and non-callable values', () => {
    @CommandHandler(DummyCommand)
    @UsePipeline([IdempotencyBehavior, {}])
    class MissingKeyFactoryHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('fails fast when IdempotencyBehavior is explicitly used without a keyFactory', () => {
      expect(() =>
        start({ behaviors: [idempotency()] }, new MissingKeyFactoryHandler()),
      ).toThrow(PipelineConfigurationError);
    });

    @QueryHandler(DummyQuery)
    @UsePipeline([CacheBehavior, { key: 'not-a-callable-factory' as never }])
    class NonCallableCacheKeyQueryHandler implements IQueryHandler<DummyQuery> {
      async execute(_query: DummyQuery): Promise<string> {
        return 'executed';
      }
    }

    it('rejects non-callable key factory values at registration', () => {
      expect(() =>
        start({ behaviors: [cache()] }, new NonCallableCacheKeyQueryHandler()),
      ).toThrowError(/CacheBehavior.*key factory must be a callable function/);
    });

    it('accepts callable factory functions at registration without executing them', () => {
      const keyFactorySpy = vi.fn(() => 'key-1');

      @QueryHandler(DummyQuery)
      @UsePipeline([CacheBehavior, { key: keyFactorySpy }])
      class SpyKeyHandler implements IQueryHandler<DummyQuery> {
        async execute(_query: DummyQuery): Promise<string> {
          return 'executed';
        }
      }

      expect(() =>
        start({ behaviors: [cache()] }, new SpyKeyHandler()),
      ).not.toThrow();
      expect(keyFactorySpy).not.toHaveBeenCalled();
    });
  });

  describe('Behavior defaults and effective configuration', () => {
    @CommandHandler(DummyCommand)
    @UsePipeline(RateLimitBehavior)
    class BareRateLimitCommandHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('registers and dispatches when the RateLimitBehavior defaults provide a key factory', async () => {
      const limiter = new RateLimiterMemory({ points: 10, duration: 60 });
      const app = start(
        {
          behaviors: [
            new RateLimitBehavior(limiter, {
              keyFactory: () => 'default-user',
            }),
          ],
        },
        new BareRateLimitCommandHandler(),
      );

      try {
        await expect(
          app.commandBus.execute(new DummyCommand('cmd-100')),
        ).resolves.toBe('executed');
      } finally {
        await app.close();
      }
    });

    @CommandHandler(DummyCommand)
    class PlainCommandHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('fails fast when RateLimitBehavior is global and its defaults provide no keyFactory', () => {
      const limiter = new RateLimiterMemory({ points: 10, duration: 60 });

      expect(() =>
        start(
          {
            behaviors: [new RateLimitBehavior(limiter)],
            globalBehaviors: { scope: 'all', before: [RateLimitBehavior] },
          },
          new PlainCommandHandler(),
        ),
      ).toThrow(PipelineConfigurationError);
    });

    @CommandHandler(DummyCommand)
    @UsePipeline(ResilienceBehavior)
    class BareResilienceCommandHandler
      implements ICommandHandler<DummyCommand>
    {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('fails fast when the ResilienceBehavior defaults configure unsafe retry for commands', () => {
      expect(() =>
        start(
          {
            behaviors: [
              new ResilienceBehavior({ retry: { maxAttempts: 2 } }, silent),
            ],
          },
          new BareResilienceCommandHandler(),
        ),
      ).toThrow(PipelineConfigurationError);
    });

    it('registers and dispatches when the ResilienceBehavior defaults are replay-safe', async () => {
      const app = start(
        {
          behaviors: [
            new ResilienceBehavior(
              {
                retry: { maxAttempts: 2, replaySafe: true },
                handleAllErrors: true,
              },
              silent,
            ),
          ],
        },
        new BareResilienceCommandHandler(),
      );

      try {
        await expect(
          app.commandBus.execute(new DummyCommand('cmd-200')),
        ).resolves.toBe('executed');
      } finally {
        await app.close();
      }
    });

    @CommandHandler(DummyCommand)
    @UsePipeline([
      ResilienceBehavior,
      { retry: { maxAttempts: 3, replaySafe: true } },
    ])
    class LocalRetryCommandHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('combines default error classification with local replaySafe retry', async () => {
      const app = start(
        {
          behaviors: [
            new ResilienceBehavior({ handleAllErrors: true }, silent),
          ],
        },
        new LocalRetryCommandHandler(),
      );

      try {
        await expect(
          app.commandBus.execute(new DummyCommand('cmd-300')),
        ).resolves.toBe('executed');
      } finally {
        await app.close();
      }
    });
  });

  describe('Global pass-through and diagnostics modes', () => {
    @CommandHandler(DummyCommand)
    class NormalCommandHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('does not fail registration when globally configured behaviors are passive on unconfigured handlers', () => {
      expect(() =>
        start(
          {
            behaviors: [new ResilienceBehavior(undefined, silent)],
            globalBehaviors: { scope: 'all', before: [ResilienceBehavior] },
          },
          new NormalCommandHandler(),
        ),
      ).not.toThrow();
    });

    @CommandHandler(DummyCommand)
    @UsePipeline([IdempotencyBehavior, {}])
    class WarnModeHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('logs warnings and does not throw when diagnostics: "warn"', () => {
      silent.warn.mockClear();

      expect(() =>
        start(
          { diagnostics: 'warn', behaviors: [idempotency()] },
          new WarnModeHandler(),
        ),
      ).not.toThrow();
      expect(silent.warn).toHaveBeenCalled();
    });

    it('skips diagnostics completely when diagnostics: "off"', () => {
      silent.warn.mockClear();

      expect(() =>
        start(
          { diagnostics: 'off', behaviors: [idempotency()] },
          new WarnModeHandler(),
        ),
      ).not.toThrow();
      expect(silent.warn).not.toHaveBeenCalled();
    });
  });
});
