/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { LoggingBehavior } from '../behaviors/logging.behavior.js';
import { type AnyClass, pipelineOf } from '../handler-pipeline.js';
import { behaviorEntryType } from '../helpers/behavior-entries.js';
import { type BehaviorId, getBehaviorId } from '../helpers/behavior-id.js';
import type { ContextSources } from '../interfaces/context-source.interface.js';
import type { IPipelineBehavior } from '../interfaces/pipeline.behavior.interface.js';
import {
  type PipelineBehaviorDiagnostic,
  PipelineConfigurationError,
} from '../interfaces/pipeline-behavior-contract.interface.js';
import type { PipelineLogger } from '../logger.js';
import type { GlobalBehaviorsOptions } from '../options/global-behaviors.options.js';
import type { Constructor, DeclaredKind } from '../types.js';
import { validateBehaviorContracts } from './pipeline-contracts.js';
import { compilePipelinePlan, toGlobalConfigs } from './pipeline-plan.js';
import {
  createPipelineRunner,
  type PipelineRunner,
} from './pipeline-runner.js';

/** The effective behaviors and options of one operation; see `compilePipelinePlan`. */
export type PipelinePlan = ReturnType<typeof compilePipelinePlan>;

/** What a behavior contract violation does: throw, log a warning, or nothing. */
export type DiagnosticsMode = 'strict' | 'warn' | 'off';

/** Returns the one instance of a behavior class. */
export type BehaviorResolver = (
  type: Constructor<IPipelineBehavior>,
) => IPipelineBehavior;

const LOGGING_ID = getBehaviorId(LoggingBehavior);

/**
 * Builds the resolver of the one instance per behavior class: the instance given for
 * that class, else `LoggingBehavior` on `logger`, else one built with no arguments. The
 * global behaviors are built here, so one that cannot be built fails at once.
 *
 * @param options.owner - The factory named in error messages, such as `createPipeline`.
 * @throws TypeError on a malformed global entry or two given instances of one class.
 * @example
 * ```ts
 * const behavior = createBehaviorResolver({
 *   owner: 'createCqrs',
 *   given: [new AuditBehavior(sink)],
 *   globalBehaviors: { before: [LoggingBehavior] },
 *   logger: console,
 * });
 * behavior(AuditBehavior); // the given instance
 * ```
 */
export function createBehaviorResolver(options: {
  owner: string;
  given: readonly IPipelineBehavior[];
  globalBehaviors:
    | GlobalBehaviorsOptions
    | GlobalBehaviorsOptions[]
    | undefined;
  logger: PipelineLogger;
}): BehaviorResolver {
  const { owner, given, globalBehaviors, logger } = options;
  const instances = new Map<BehaviorId, IPipelineBehavior>();
  for (const instance of given) {
    const type = instance.constructor as Constructor<IPipelineBehavior>;
    const id = getBehaviorId(type);
    if (instances.has(id)) {
      throw new TypeError(
        `${owner}: two instances of ${type.name}; pass one per behavior class.`,
      );
    }
    instances.set(id, instance);
  }

  const resolve: BehaviorResolver = (type) => {
    const id = getBehaviorId(type);
    let instance = instances.get(id);
    if (!instance) {
      instance = id === LOGGING_ID ? new LoggingBehavior(logger) : new type();
      instances.set(id, instance);
    }
    return instance;
  };

  for (const config of toGlobalConfigs(globalBehaviors)) {
    for (const entry of [...(config.before ?? []), ...(config.after ?? [])]) {
      resolve(behaviorEntryType(entry, `${owner} globalBehaviors`));
    }
  }
  return resolve;
}

/**
 * Applies the diagnostics mode to the contract violations found: `'strict'` throws them
 * together, `'warn'` logs each one, `'off'` does nothing.
 *
 * @throws PipelineConfigurationError in `'strict'` mode when `found` is not empty.
 * @example
 * ```ts
 * const found: PipelineBehaviorDiagnostic[] = [];
 * createHandlerRunner({ handlerType, kind, plan, method, behaviors, diagnostics: found });
 * reportDiagnostics(found, 'strict', console);
 * ```
 */
export function reportDiagnostics(
  found: readonly PipelineBehaviorDiagnostic[],
  mode: DiagnosticsMode,
  logger: Pick<PipelineLogger, 'warn'>,
): void {
  if (mode === 'off' || found.length === 0) return;
  if (mode === 'strict') throw new PipelineConfigurationError(found);
  for (const d of found) {
    logger.warn(
      `[Pipeline Diagnostic] '${d.handlerName}' with behavior '${d.behaviorName}': ${d.message}. Fix: ${d.fix}`,
    );
  }
}

/**
 * Compiles the pipeline a handler class declares with `@UsePipeline` and
 * `@SkipPipeline`, together with the global behaviors that match its kind.
 *
 * @throws Error when the handler both declares and skips one behavior.
 * @example
 * ```ts
 * const plan = compileHandlerPlan(CreateUserHandler, 'command', globalBehaviors);
 * plan.behaviorTypes; // [LoggingBehavior, AuditBehavior]
 * ```
 */
export function compileHandlerPlan(
  handlerType: AnyClass,
  kind: DeclaredKind,
  globalBehaviors?: GlobalBehaviorsOptions | GlobalBehaviorsOptions[],
): PipelinePlan {
  const declared = pipelineOf(handlerType);
  return compilePipelinePlan({
    handlerName: handlerType.name,
    requestKind: kind,
    handlerBehaviorTypes: declared.types,
    handlerOptions: declared.options,
    skippedBehaviorTypes: declared.skipped,
    globalBehaviors,
  });
}

/** Appends the contract violations of a plan's resolved behaviors to `diagnostics`. */
export function validatePlan(
  plan: PipelinePlan,
  handler: {
    handlerType: Constructor;
    handlerName: string;
    kind: DeclaredKind;
  },
  behaviors: readonly IPipelineBehavior[],
  diagnostics: PipelineBehaviorDiagnostic[],
): void {
  validateBehaviorContracts({
    ...plan,
    handlerType: handler.handlerType,
    handlerName: handler.handlerName,
    requestKind: handler.kind,
    resolvedBehaviors: new Map(behaviors.map((b, i) => [i, b])),
    diagnostics,
  });
}

/** The options map a context reads, absent when no behavior has options. */
export function behaviorOptionsOf(plan: PipelinePlan) {
  return plan.mergedOptions.size > 0 ? plan.mergedOptions : undefined;
}

/**
 * Binds a handler method to its compiled pipeline: validates the behavior contracts,
 * reports the chain, and returns the runner the bus or the adapter calls per request.
 *
 * @param binding.method - The handler's `execute` or `handle`; its name is logged.
 * @param binding.behaviors - The instances of `plan.behaviorTypes`, in order.
 * @param binding.diagnostics - Receives contract violations; absent, none are checked.
 * @param binding.log - Receives one line naming the chain, when the handler has one.
 * @example
 * ```ts
 * const plan = compileHandlerPlan(CreateUserHandler, 'command', globalBehaviors);
 * const run = createHandlerRunner({
 *   handlerType: CreateUserHandler,
 *   kind: 'command',
 *   plan,
 *   method: CreateUserHandler.prototype.execute,
 *   behaviors: plan.behaviorTypes.map(behavior),
 *   sources,
 * });
 * await run(handler, command);
 * ```
 */
export function createHandlerRunner(binding: {
  handlerType: Constructor;
  kind: DeclaredKind;
  plan: PipelinePlan;
  // biome-ignore lint/suspicious/noExplicitAny: the handler's arguments are opaque here
  method: (this: unknown, ...args: any[]) => unknown;
  behaviors: readonly IPipelineBehavior[];
  sources?: ContextSources;
  diagnostics?: PipelineBehaviorDiagnostic[];
  log?: (message: string) => void;
}): PipelineRunner {
  const { handlerType, kind, plan, method, behaviors } = binding;
  const handlerName = handlerType.name;
  if (plan.hasPipeline) {
    const methodName = kind === 'event' ? 'handle' : 'execute';
    const chain = plan.behaviorTypes.map((type) => type.name).join(' → ');
    binding.log?.(
      `Wrapping ${handlerName}.${methodName}() [${kind}] with pipeline: [${chain}]`,
    );
  }
  if (binding.diagnostics) {
    validatePlan(
      plan,
      { handlerType, handlerName, kind },
      behaviors,
      binding.diagnostics,
    );
  }

  return createPipelineRunner(
    method,
    {
      handlerType,
      handlerName,
      requestKind: kind,
      behaviorOptions: behaviorOptionsOf(plan),
    },
    behaviors,
    plan.hasPipeline,
    binding.sources,
  );
}
