/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { LoggingBehavior } from './behaviors/logging.behavior.js';
import { pipelineStore } from './constants/pipeline-context.constants.js';
import { createPipeline, REQUEST_KIND } from './create-pipeline.js';
import { PIPELINE_BEHAVIOR_ID } from './helpers/behavior-id.js';
import type { ContextSource } from './interfaces/context-source.interface.js';
import type {
  IPipelineBehavior,
  IPipelineBehaviorOptionsResolver,
  NextDelegate,
} from './interfaces/pipeline.behavior.interface.js';
import type { IPipelineContext } from './interfaces/pipeline.context.interface.js';
import {
  type IPipelineBehaviorContract,
  PIPELINE_BEHAVIOR_CONTRACT,
  PipelineConfigurationError,
} from './interfaces/pipeline-behavior-contract.interface.js';

const trace: string[] = [];

function recorder(label: string) {
  return class implements IPipelineBehavior {
    static readonly label = label;
    async handle(context: IPipelineContext, next: NextDelegate) {
      const options = context.getBehaviorOptions<{ tag?: string }>(
        this.constructor as never,
      );
      trace.push(`${label}${options?.tag ? `:${options.tag}` : ''}`);
      return next();
    }
  };
}

const Outer = recorder('outer');
const Inner = recorder('inner');
const Guard = recorder('guard');

function seen<T>(read: (context: IPipelineContext) => T) {
  let value: T | undefined;
  class Probe implements IPipelineBehavior {
    async handle(context: IPipelineContext, next: NextDelegate) {
      value = read(context);
      return next();
    }
  }
  return { Probe, value: () => value };
}

describe('createPipeline().wrap on plain functions', () => {
  it('runs the behaviors outermost first around the function and returns its result', async () => {
    trace.length = 0;
    const pipeline = createPipeline();
    const add = pipeline.wrap(
      { name: 'add', kind: 'query' },
      Outer,
      Inner,
    )((a: number, b: number) => a + b);

    await expect(add(2, 3)).resolves.toBe(5);
    expect(trace).toEqual(['outer', 'inner']);
  });

  it('names the operation after the declared name, never after the request class', async () => {
    const probe = seen((context) => [context.requestName, context.handlerName]);
    const pipeline = createPipeline();
    const getPrice = pipeline.wrap(
      { name: 'getPrice', kind: 'query' },
      probe.Probe,
    )(async (input: { sku: string }) => input.sku);

    await getPrice({ sku: 'a' });
    expect(probe.value()).toEqual(['getPrice', 'getPrice']);
  });

  it('shows behaviors the only argument as the request, and the argument array otherwise', async () => {
    const requests: unknown[] = [];
    const probe = seen((context) => requests.push(context.request));
    const pipeline = createPipeline();
    const one = pipeline.wrap(
      { name: 'one', kind: 'query' },
      probe.Probe,
    )((list: number[]) => list.length);
    const two = pipeline.wrap(
      { name: 'two', kind: 'query' },
      probe.Probe,
    )((a: number, b: number) => a * b);

    await expect(one([7, 8, 9])).resolves.toBe(3);
    await expect(two(4, 5)).resolves.toBe(20);
    expect(requests).toEqual([
      [7, 8, 9],
      [4, 5],
    ]);
  });

  it('calls the function directly when no behavior applies', async () => {
    const pipeline = createPipeline();
    const echo = pipeline.wrap({ name: 'echo', kind: 'event' })(
      (value: string) => value,
    );

    await expect(echo('x')).resolves.toBe('x');
  });

  it('refuses a plain function without a name', () => {
    expect(() => createPipeline().wrap({ kind: 'query' })(() => 1)).toThrow(
      'a plain function needs a `name`',
    );
  });

  it('refuses an unknown kind when wrap() runs', () => {
    expect(() =>
      createPipeline().wrap({ name: 'x', kind: 'read' as never }),
    ).toThrow("kind must be 'command', 'query' or 'event'");
  });

  it('refuses a call without a kind when the request carries no brand', async () => {
    const lookup = createPipeline().wrap(
      { name: 'lookup' },
      Outer,
    )((id: string) => id);

    await expect(lookup('1')).rejects.toThrow('declare its kind');
    await expect(lookup(null as never)).rejects.toThrow('declare its kind');
  });

  it('rejects malformed entries before anything runs', () => {
    expect(() =>
      createPipeline().wrap({ name: 'x', kind: 'query' }, 'nope' as never),
    ).toThrow('expected a behavior class');
    expect(() =>
      createPipeline().wrap({ name: 'x', kind: 'query' }, [
        Outer,
        { tag: 'a' },
        'extra',
      ] as never),
    ).toThrow('expected a behavior class');
    expect(() =>
      createPipeline().wrap({ name: 'x', kind: 'query' }, [
        Outer,
        'a',
      ] as never),
    ).toThrow('options for');
  });

  it('refuses to apply to something that is neither a function nor a method', () => {
    const apply = createPipeline().wrap({ name: 'x', kind: 'query' });
    expect(() =>
      (apply as (...a: unknown[]) => unknown)({}, 'key', {}),
    ).toThrow('applies to a function or a method');
  });
});

describe('createPipeline behaviors and globalBehaviors', () => {
  it('uses the given instance, and builds a placed behavior that has none', async () => {
    trace.length = 0;
    const handle = vi.fn((_c: IPipelineContext, next: NextDelegate) => next());
    class Counted implements IPipelineBehavior {
      handle = handle;
    }
    const instance = new Counted();
    const pipeline = createPipeline({
      behaviors: [instance],
      globalBehaviors: { before: [Outer] },
    });
    const run = pipeline.wrap(
      { name: 'run', kind: 'command' },
      Counted,
    )(() => 'ok');

    await expect(run()).resolves.toBe('ok');
    expect(handle).toHaveBeenCalledTimes(1);
    expect(trace).toEqual(['outer']);
  });

  it('gives a LoggingBehavior it builds the pipeline logger', async () => {
    const lines: unknown[] = [];
    const logger = {
      log: (message: unknown) => lines.push(message),
      error: () => {},
      warn: () => {},
      debug: () => {},
      verbose: () => {},
    };
    const pipeline = createPipeline({
      logger,
      globalBehaviors: { before: [LoggingBehavior] },
    });

    await pipeline.wrap({ name: 'ping', kind: 'query' })(async () => 'pong')();

    expect(lines).toEqual([
      expect.stringMatching(/QUERY ping → ping completed in/),
    ]);
  });

  it('refuses two instances of one behavior class', () => {
    expect(() =>
      createPipeline({ behaviors: [new Outer(), new Outer()] }),
    ).toThrow(
      `createPipeline: two instances of ${Outer.name}; pass one per behavior class.`,
    );
  });

  it('fails at creation when a global behavior cannot be built without its dependency', () => {
    class NeedsStore implements IPipelineBehavior {
      constructor(store?: object) {
        if (!store) throw new TypeError('NeedsStore requires a store');
      }
      handle(_c: IPipelineContext, next: NextDelegate) {
        return next();
      }
    }
    expect(() =>
      createPipeline({ globalBehaviors: [{ after: [NeedsStore] }] }),
    ).toThrow('NeedsStore requires a store');
  });

  it('places globalBehaviors before and after the call-site entries, by scope', async () => {
    trace.length = 0;
    const pipeline = createPipeline({
      globalBehaviors: [
        { scope: 'all', before: [Guard] },
        { scope: 'commands', after: [Inner] },
        { scope: 'queries', before: [[Outer, { tag: 'query' }]] },
        { scope: 'events', before: [[Outer, { tag: 'event' }]] },
      ],
    });
    const write = pipeline.wrap(
      { name: 'write', kind: 'command' },
      Outer,
    )(() => 1);
    const read = pipeline.wrap({ name: 'read', kind: 'query' })(() => 2);

    await write();
    expect(trace).toEqual(['guard', 'outer', 'inner']);
    trace.length = 0;
    await read();
    expect(trace).toEqual(['guard', 'outer:query']);
  });

  it('runs a behavior declared globally and at the call site once, at its global position, with merged options', async () => {
    trace.length = 0;
    const pipeline = createPipeline({
      globalBehaviors: { before: [[Guard, { tag: 'global' }]] },
    });
    const run = pipeline.wrap(
      { name: 'run', kind: 'query' },
      Outer,
      [Guard, { tag: 'local' }],
      Outer,
    )(() => 1);

    await run();
    expect(trace).toEqual(['guard:local', 'outer']);
  });

  it('lets an operation skip a global behavior, and refuses skipping one it declares', async () => {
    trace.length = 0;
    const pipeline = createPipeline({
      globalBehaviors: { before: [Guard, Outer] },
    });
    const run = pipeline.wrap({ name: 'run', kind: 'query', skip: [Guard] })(
      () => 1,
    );

    await run();
    expect(trace).toEqual(['outer']);
    expect(() =>
      pipeline.wrap(
        { name: 'x', kind: 'query', skip: [Guard] },
        Guard,
      )(() => 1),
    ).toThrow('both skipped and declared');
    expect(() =>
      pipeline.wrap({ name: 'x', kind: 'query', skip: [[Guard, {}]] as never })(
        () => 1,
      ),
    ).toThrow('expected a behavior class');
  });
});

describe('createPipeline diagnostics', () => {
  class Cacheish
    implements
      IPipelineBehavior,
      IPipelineBehaviorOptionsResolver<{ key?: unknown }>
  {
    static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
      order: { after: ['guard-id'], before: [Inner] },
      validate: (context) =>
        context.effectiveOptions?.key
          ? undefined
          : [
              {
                handlerName: context.handlerName,
                behaviorName: 'Cacheish',
                message: `needs a key (${context.declarationSource})`,
                fix: 'pass one',
              },
            ],
    };
    resolveEffectiveOptions(options?: { key?: unknown }) {
      return { key: 'default', ...options };
    }
    handle(_c: IPipelineContext, next: NextDelegate) {
      return next();
    }
  }
  class IdentifiedGuard implements IPipelineBehavior {
    static readonly [PIPELINE_BEHAVIOR_ID] = 'guard-id';
    handle(_c: IPipelineContext, next: NextDelegate) {
      return next();
    }
  }
  class Dynamic implements IPipelineBehavior {
    static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
      order: (context) =>
        context.requestKind === 'query'
          ? { after: ['IdentifiedGuard'] }
          : undefined,
    };
    handle(_c: IPipelineContext, next: NextDelegate) {
      return next();
    }
  }

  it('throws a PipelineConfigurationError on wrap() for ordering violations in strict mode', () => {
    const pipeline = createPipeline();
    const attempt = () =>
      pipeline.wrap(
        { name: 'bad', kind: 'query' },
        Inner,
        Cacheish,
        IdentifiedGuard,
      )(() => 1);

    expect(attempt).toThrow(PipelineConfigurationError);
    expect(attempt).toThrow(
      /positioned before IdentifiedGuard.*\n.*positioned after inner|positioned/,
    );
  });

  it('accepts an order that satisfies the contract, with options resolved by the instance', () => {
    expect(() =>
      createPipeline().wrap(
        { name: 'good', kind: 'query' },
        IdentifiedGuard,
        Cacheish,
        Inner,
        Dynamic,
      )(() => 1),
    ).not.toThrow();
  });

  it('reports a dynamic order rule only for the kinds it names', () => {
    const pipeline = createPipeline();
    expect(() =>
      pipeline.wrap(
        { name: 'q', kind: 'query' },
        Dynamic,
        IdentifiedGuard,
      )(() => 1),
    ).toThrow('must execute after it');
    expect(() =>
      pipeline.wrap(
        { name: 'c', kind: 'command' },
        Dynamic,
        IdentifiedGuard,
      )(() => 1),
    ).not.toThrow();
  });

  it('validates options, naming where the behavior was declared', () => {
    class NoKey implements IPipelineBehavior {
      static readonly [PIPELINE_BEHAVIOR_CONTRACT] =
        Cacheish[PIPELINE_BEHAVIOR_CONTRACT];
      handle(_c: IPipelineContext, next: NextDelegate) {
        return next();
      }
    }
    expect(() =>
      createPipeline().wrap({ name: 'local', kind: 'event' }, NoKey)(() => 1),
    ).toThrow('needs a key (handler)');
    expect(() =>
      createPipeline({ globalBehaviors: { before: [NoKey] } }).wrap({
        name: 'global',
        kind: 'event',
      })(() => 1),
    ).toThrow('needs a key (global)');
    expect(() =>
      createPipeline({ globalBehaviors: { before: [NoKey] } }).wrap(
        { name: 'both', kind: 'event' },
        NoKey,
      )(() => 1),
    ).toThrow('needs a key (both)');
  });

  it('logs diagnostics in warn mode and ignores them when off', () => {
    const warn = vi.fn();
    const logger = { log: vi.fn(), error: vi.fn(), warn };
    createPipeline({ diagnostics: 'warn', logger }).wrap(
      { name: 'bad', kind: 'query' },
      Cacheish,
      IdentifiedGuard,
    )(() => 1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "[Pipeline Diagnostic] 'bad' with behavior 'Cacheish'",
      ),
    );

    expect(() =>
      createPipeline({ diagnostics: 'off' }).wrap(
        { name: 'bad', kind: 'query' },
        Cacheish,
        IdentifiedGuard,
      )(() => 1),
    ).not.toThrow();
  });
});

describe('createPipeline().wrap on methods', () => {
  class GetPriceQuery {
    get [REQUEST_KIND]() {
      return 'query' as const;
    }
    constructor(readonly sku: string) {}
  }
  class NotAKind {
    get [REQUEST_KIND]() {
      return 'read';
    }
  }

  it('decorates a method in the experimentalDecorators mode, keeping this and naming it Class.method', async () => {
    const probe = seen((context) => [context.requestName, context.handlerName]);
    const pipeline = createPipeline();
    class Prices {
      rate = 2;
      @pipeline.wrap({ kind: 'query' }, probe.Probe)
      async find(sku: string) {
        return `${sku}x${this.rate}`;
      }
    }

    await expect(new Prices().find('a')).resolves.toBe('ax2');
    expect(probe.value()).toEqual(['Prices.find', 'Prices.find']);
  });

  it('takes the kind and the name from a branded request', async () => {
    const probe = seen((context) => [
      context.requestKind,
      context.requestName,
      context.handlerName,
    ]);
    const pipeline = createPipeline();
    class GetPriceHandler {
      @pipeline.wrap(probe.Probe)
      async execute(query: GetPriceQuery) {
        return query.sku;
      }
      static async lookup(query: GetPriceQuery) {
        return query.sku;
      }
    }

    await expect(
      new GetPriceHandler().execute(new GetPriceQuery('s')),
    ).resolves.toBe('s');
    expect(probe.value()).toEqual([
      'query',
      'GetPriceQuery',
      'GetPriceHandler.execute',
    ]);
    await expect(
      new GetPriceHandler().execute(new NotAKind() as never),
    ).rejects.toThrow('declare its kind');
  });

  it('decorates a method in the standard decorator mode', async () => {
    const probe = seen((context) => context.handlerName);
    const method = async function (this: unknown, sku: string) {
      return sku;
    };
    const wrapped = createPipeline().wrap({ kind: 'query' }, probe.Probe)(
      method,
      { kind: 'method', name: 'find' } as ClassMethodDecoratorContext,
    );

    await expect(wrapped.call(new (class Catalog {})(), 'b')).resolves.toBe(
      'b',
    );
    expect(probe.value()).toBe('Catalog.find');
    await expect(wrapped.call(class Static {}, 'c')).resolves.toBe('c');
    expect(probe.value()).toBe('Static.find');
    await expect(wrapped.call(undefined, 'd')).resolves.toBe('d');
    expect(probe.value()).toBe('anonymous.find');
  });

  it('refuses to decorate anything but a method', () => {
    expect(() =>
      createPipeline().wrap({ kind: 'query' })(() => 1, {
        kind: 'field',
        name: 'f',
      } as unknown as ClassMethodDecoratorContext),
    ).toThrow('decorates methods, not a field');
  });
});

describe('createPipeline context propagation', () => {
  it('runs inside the sources, and nested wrapped calls inherit the correlation id and tenant', async () => {
    let tenant: string | undefined = 'acme';
    const tenantSource: ContextSource = {
      current: () => tenant,
      run: (value, fn) => {
        const previous = tenant;
        tenant = value;
        try {
          return fn();
        } finally {
          tenant = previous;
        }
      },
    };
    const ids: string[] = [];
    const probe = seen((context) => {
      ids.push(`${context.tenantId}/${context.correlationId}`);
      return pipelineStore.getStore() === context;
    });
    const pipeline = createPipeline({ sources: { tenantId: tenantSource } });
    const inner = pipeline.wrap(
      { name: 'inner', kind: 'query' },
      probe.Probe,
    )(() => 'inner');
    const outer = pipeline.wrap(
      { name: 'outer', kind: 'command' },
      probe.Probe,
    )(() => inner());

    await expect(outer()).resolves.toBe('inner');
    expect(probe.value()).toBe(true);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0].startsWith('acme/')).toBe(true);
  });
});
