/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { LoggingBehavior } from './behaviors/logging.behavior.js';
import type { PipelineBehaviorEntry } from './entries.js';
import {
  behaviorEntryType,
  normalizeBehaviorEntries,
} from './helpers/behavior-entries.js';
import { type BehaviorId, getBehaviorId } from './helpers/behavior-id.js';
import type { ContextSources } from './interfaces/context-source.interface.js';
import type { IPipelineBehavior } from './interfaces/pipeline.behavior.interface.js';
import {
  type PipelineBehaviorDiagnostic,
  PipelineConfigurationError,
} from './interfaces/pipeline-behavior-contract.interface.js';
import type { PipelineLogger } from './logger.js';
import type { GlobalBehaviorsOptions } from './options/global-behaviors.options.js';
import { validateBehaviorContracts } from './services/pipeline-contracts.js';
import {
  compilePipelinePlan,
  type RequestKind,
  toGlobalConfigs,
} from './services/pipeline-plan.js';
import {
  createPipelineRunner,
  type PipelineRunner,
} from './services/pipeline-runner.js';
import type { Constructor } from './types.js';

/** The kinds a wrapped function or a request declares. */
export type DeclaredKind = Exclude<RequestKind, 'unknown'>;

const KINDS: readonly DeclaredKind[] = ['command', 'query', 'event'];

/**
 * Brand by which a request tells a pipeline its kind, so a wrapped method needs no
 * `kind` option; the request's class name then names the operation. `@cqrs-ddd/core`
 * puts it on `BaseCommand`, `BaseQuery` and `DomainEvent`; any class can declare it.
 *
 * @example
 * ```ts
 * class GetPriceQuery {
 *   get [REQUEST_KIND]() {
 *     return 'query' as const;
 *   }
 *   constructor(readonly sku: string) {}
 * }
 * ```
 */
export const REQUEST_KIND = Symbol.for('@cqrs-ddd/request-kind');

/** Configuration of {@link createPipeline}. */
export interface PipelineOptions {
  /**
   * Instances of the behaviors that need dependencies, one per behavior class. A placed
   * behavior without an instance is constructed with no arguments.
   */
  behaviors?: readonly IPipelineBehavior[];
  /**
   * Behaviors applied to every wrapped function, by scope: `before` the call-site
   * entries, `after` them. A behavior placed here and at a call site runs once, at its
   * global position, with the call-site options shallowly merged over these.
   */
  globalBehaviors?: GlobalBehaviorsOptions | GlobalBehaviorsOptions[];
  /** Where executions take their tenant and correlation id from. */
  sources?: ContextSources;
  /**
   * What a behavior contract violation does when a function or method is wrapped (module
   * load or class definition): throw (`'strict'`), log a warning (`'warn'`), or nothing
   * (`'off'`).
   * @default 'strict'
   */
  diagnostics?: 'strict' | 'warn' | 'off';
  /**
   * Receives the `'warn'` diagnostics, and is the logger of a `LoggingBehavior` the pipeline
   * constructs itself (one placed without an instance in `behaviors`).
   * @default console
   */
  logger?: PipelineLogger;
}

/** Options of one {@link Pipeline.wrap} call. */
export interface WrapOptions {
  /**
   * The operation name, used in keys and logs. Required for a plain function; a method
   * defaults to `Class.method`, or to the class name of a branded request.
   */
  name?: string;
  /**
   * What the operation does: a `query` reads, a `command` changes state, an `event`
   * reacts. Required unless every request carries {@link REQUEST_KIND}.
   */
  kind?: DeclaredKind;
  /** Global behaviors this operation opts out of. */
  skip?: readonly Constructor<IPipelineBehavior>[];
}

// biome-ignore lint/suspicious/noExplicitAny: wrapped functions take any arguments
type AnyFunction = (...args: any[]) => unknown;

/**
 * What {@link Pipeline.wrap} returns: wraps a plain function, or decorates a method in
 * the standard and the `experimentalDecorators` mode. The wrapped function returns a
 * promise.
 */
export interface Wrap {
  <F extends AnyFunction>(
    fn: F,
  ): (...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>>;
  <F extends AnyFunction>(method: F, context: ClassMethodDecoratorContext): F;
  (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor;
}

/** A configured pipeline; see {@link createPipeline}. */
export interface Pipeline {
  /**
   * Prepares the behaviors of one operation: entries are behavior classes or
   * `[Behavior, options]` tuples, outermost first, such as `cache({ key })`.
   *
   * @throws TypeError on a malformed entry or an unknown `kind`.
   * @throws PipelineConfigurationError in `'strict'` mode when the result wraps a function
   *   or method of a declared `kind` whose behaviors violate a contract.
   */
  wrap(...entries: PipelineBehaviorEntry[]): Wrap;
  wrap(options: WrapOptions, ...entries: PipelineBehaviorEntry[]): Wrap;
}

/**
 * Creates a pipeline: behaviors that wrap plain functions and class methods with
 * cross-cutting concerns, with no framework and no dependency-injection container.
 *
 * Global behaviors are constructed when the pipeline is created, so a behavior whose
 * required dependency is missing fails here rather than at its first call.
 *
 * @throws TypeError on a malformed global entry or two instances of one behavior class.
 * @example
 * ```ts
 * const pipeline = createPipeline({
 *   behaviors: [new CacheBehavior(buildCache({}))],
 *   globalBehaviors: { before: [logging({ requestResponseLogLevel: 'log' })] },
 * });
 *
 * export const getPrice = pipeline.wrap(
 *   { name: 'getPrice', kind: 'query' },
 *   cache({ key }),
 * )(async (sku: string) => prices.find(sku));
 *
 * class Prices {
 *   @pipeline.wrap({ kind: 'query' }, cache({ key }))
 *   async find(sku: string) {}
 * }
 * ```
 */
export function createPipeline(options: PipelineOptions = {}): Pipeline {
  const {
    globalBehaviors,
    sources = {},
    diagnostics = 'strict',
    logger = console,
  } = options;
  const setup: PipelineSetup = {
    globalBehaviors,
    sources,
    diagnostics,
    logger,
    instances: indexBehaviors(options.behaviors ?? []),
  };
  for (const config of toGlobalConfigs(globalBehaviors)) {
    for (const entry of [...(config.before ?? []), ...(config.after ?? [])]) {
      instanceOf(
        setup,
        behaviorEntryType(entry, 'createPipeline globalBehaviors'),
      );
    }
  }

  function wrap(...input: Array<WrapOptions | PipelineBehaviorEntry>): Wrap {
    return wrapperOf(toDeclaration(setup, input));
  }

  return { wrap } as Pipeline;
}

/** What {@link createPipeline} fixes for every operation it wraps. */
interface PipelineSetup {
  globalBehaviors: PipelineOptions['globalBehaviors'];
  sources: ContextSources;
  diagnostics: NonNullable<PipelineOptions['diagnostics']>;
  logger: PipelineLogger;
  /** One instance per behavior identity, shared by every wrapped operation. */
  instances: Map<BehaviorId, IPipelineBehavior>;
}

/** One {@link Pipeline.wrap} call: its pipeline, its options and its entries. */
interface WrapDeclaration {
  setup: PipelineSetup;
  options: WrapOptions;
  declared: ReturnType<typeof normalizeBehaviorEntries>;
}

/** A function or method bound by a {@link Pipeline.wrap} call. */
interface Operation extends WrapDeclaration {
  fn: AnyFunction;
  label: string;
  handlerType: Constructor;
}

function indexBehaviors(
  behaviors: readonly IPipelineBehavior[],
): Map<BehaviorId, IPipelineBehavior> {
  const instances = new Map<BehaviorId, IPipelineBehavior>();
  for (const behavior of behaviors) {
    const type = behavior.constructor as Constructor<IPipelineBehavior>;
    const id = getBehaviorId(type);
    if (instances.has(id)) {
      throw new TypeError(
        `createPipeline: two instances of ${type.name}; pass one per behavior class.`,
      );
    }
    instances.set(id, behavior);
  }
  return instances;
}

function instanceOf(
  setup: PipelineSetup,
  type: Constructor<IPipelineBehavior>,
): IPipelineBehavior {
  const id = getBehaviorId(type);
  let instance = setup.instances.get(id);
  if (!instance) {
    instance =
      id === LOGGING_ID ? new LoggingBehavior(setup.logger) : new type();
    setup.instances.set(id, instance);
  }
  return instance;
}

function toDeclaration(
  setup: PipelineSetup,
  input: Array<WrapOptions | PipelineBehaviorEntry>,
): WrapDeclaration {
  const [first] = input;
  const hasOptions =
    typeof first === 'object' && first !== null && !Array.isArray(first);
  const options = (hasOptions ? first : {}) as WrapOptions;
  const entries = (hasOptions ? input.slice(1) : input) as unknown[];

  if (options.kind !== undefined && !KINDS.includes(options.kind)) {
    throw new TypeError(
      `pipeline.wrap: kind must be 'command', 'query' or 'event', received ${String(options.kind)}.`,
    );
  }

  return {
    setup,
    options,
    declared: normalizeBehaviorEntries(entries, 'pipeline.wrap'),
  };
}

function wrapperOf(declaration: WrapDeclaration): Wrap {
  function apply(target: unknown, key?: unknown, descriptor?: unknown) {
    if (key === undefined && typeof target === 'function') {
      return bind(declaration, target as AnyFunction);
    }
    if (isDecoratorContext(key)) {
      if (key.kind !== 'method') {
        throw new TypeError(
          `pipeline.wrap decorates methods, not a ${key.kind}.`,
        );
      }
      return bind(declaration, target as AnyFunction, String(key.name));
    }
    const property = descriptor as PropertyDescriptor | undefined;
    if (typeof property?.value === 'function') {
      property.value = bind(declaration, property.value, String(key));
      return property;
    }
    throw new TypeError(
      'pipeline.wrap(...) applies to a function or a method.',
    );
  }

  return apply as Wrap;
}

function bind(
  declaration: WrapDeclaration,
  fn: AnyFunction,
  methodKey?: string,
): AnyFunction {
  const { options } = declaration;
  const label = options.name ?? methodKey;
  if (label === undefined) {
    throw new TypeError(
      'pipeline.wrap: a plain function needs a `name`, which keys and logs use to tell operations apart.',
    );
  }

  const handlerType = { [label]: class {} }[label] as Constructor;
  const operation: Operation = { ...declaration, fn, label, handlerType };

  const runners = new Map<DeclaredKind, PipelineRunner>();
  const runnerFor = (kind: DeclaredKind) => {
    let runner = runners.get(kind);
    if (!runner) {
      runner = createRunner(operation, kind);
      runners.set(kind, runner);
    }
    return runner;
  };
  if (options.kind) runnerFor(options.kind);

  return async function (this: unknown, ...args: unknown[]) {
    const request = args.length === 1 ? args[0] : args;
    const kind = options.kind ?? brandOf(request);
    if (!kind) {
      throw new TypeError(
        `${label}: declare its kind with pipeline.wrap({ kind }), or pass a request that carries REQUEST_KIND.`,
      );
    }

    return runnerFor(kind)(this, request, args);
  };
}

function createRunner(
  operation: Operation,
  kind: DeclaredKind,
): PipelineRunner {
  const { setup, options, fn, label, handlerType } = operation;
  const { plan, behaviors } = compile(operation, kind);
  const behaviorOptions =
    plan.mergedOptions.size > 0 ? plan.mergedOptions : undefined;

  return createPipelineRunner(
    fn,
    (request, self) => {
      const handlerName = options.name ?? `${ownerName(self)}.${label}`;
      return {
        handlerType,
        handlerName,
        requestKind: kind,
        behaviorOptions,
        requestName:
          options.name ?? (brandOf(request) ? undefined : handlerName),
      };
    },
    behaviors,
    plan.hasPipeline,
    setup.sources,
  );
}

function compile(operation: Operation, requestKind: DeclaredKind) {
  const { setup, options, declared, label: handlerName } = operation;
  const { skip } = options;

  const plan = compilePipelinePlan({
    handlerName,
    requestKind,
    handlerBehaviorTypes: declared.types,
    handlerOptions: declared.options,
    skippedBehaviorTypes: skip
      ? normalizeBehaviorEntries(skip, 'pipeline.wrap skip', false).types
      : undefined,
    globalBehaviors: setup.globalBehaviors,
  });
  const behaviors = plan.behaviorTypes.map((type) => instanceOf(setup, type));

  if (setup.diagnostics !== 'off') {
    const found: PipelineBehaviorDiagnostic[] = [];
    validateBehaviorContracts({
      ...plan,
      handlerType: Object,
      handlerName,
      requestKind,
      resolvedBehaviors: new Map(behaviors.map((b, i) => [i, b])),
      diagnostics: found,
    });
    if (found.length > 0 && setup.diagnostics === 'strict') {
      throw new PipelineConfigurationError(found);
    }
    for (const d of found) {
      setup.logger.warn(
        `[Pipeline Diagnostic] '${d.handlerName}' with behavior '${d.behaviorName}': ${d.message}. Fix: ${d.fix}`,
      );
    }
  }

  return { plan, behaviors };
}

const LOGGING_ID = getBehaviorId(LoggingBehavior);

function brandOf(request: unknown): DeclaredKind | undefined {
  if (typeof request !== 'object' || request === null) return undefined;
  const kind = (request as Record<symbol, unknown>)[REQUEST_KIND];
  return KINDS.includes(kind as DeclaredKind)
    ? (kind as DeclaredKind)
    : undefined;
}

function ownerName(self: unknown): string {
  if (typeof self === 'function') return self.name;
  return (self as object | undefined)?.constructor?.name ?? 'anonymous';
}

function isDecoratorContext(
  value: unknown,
): value is { kind: string; name: string | symbol } {
  return typeof value === 'object' && value !== null && 'kind' in value;
}
