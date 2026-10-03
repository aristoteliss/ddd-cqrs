/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type Constructor,
  type ContextSources,
  compilePipelinePlan,
  createPipelineRunner,
  type DeclaredKind,
  type GlobalBehaviorsOptions,
  type IPipelineBehavior,
  type PipelineBehaviorDiagnostic,
  validateBehaviorContracts,
} from '@cqrs-ddd/pipeline';
import { pipelineOf, type RequestType } from './decorators.js';
import {
  InvalidCommandHandlerException,
  InvalidEventsHandlerException,
  InvalidQueryHandlerException,
} from './errors.js';

/** Runs one request through its handler and the handler's pipeline. */
export type Dispatch = (request: unknown) => Promise<unknown>;

/** What every handler's pipeline shares. */
export interface PipelineSettings {
  readonly globalBehaviors?: GlobalBehaviorsOptions | GlobalBehaviorsOptions[];
  readonly sources?: ContextSources;
  /** Returns the one instance of a behavior class. */
  readonly behavior: (
    type: Constructor<IPipelineBehavior>,
  ) => IPipelineBehavior;
  /** Receives contract violations; absent, contracts are not validated. */
  readonly diagnostics?: PipelineBehaviorDiagnostic[];
  /** Receives a line per handler that runs behaviors, naming them in order. */
  readonly log?: (message: string) => void;
}

const INVALID = {
  command: InvalidCommandHandlerException,
  query: InvalidQueryHandlerException,
  event: InvalidEventsHandlerException,
};

/**
 * Compiles a handler class's pipeline once, from its decorators and the global behaviors,
 * and returns the function the bus calls per request; `resolve` gives the instance that
 * handles each request. The handler is named by its class.
 *
 * @throws InvalidCommandHandlerException, InvalidQueryHandlerException or
 *   InvalidEventsHandlerException when the handler lacks `execute`, or `handle` for an
 *   event.
 * @throws Error when the handler both declares and skips one behavior.
 */
export function toDispatch(
  handlerType: Constructor,
  resolve: () => object,
  kind: DeclaredKind,
  settings: PipelineSettings,
): Dispatch {
  const name = kind === 'event' ? 'handle' : 'execute';
  const method = Reflect.get(handlerType.prototype, name);
  if (typeof method !== 'function') throw new INVALID[kind]();
  const handlerName = handlerType.name;
  const declared = pipelineOf(handlerType);
  const plan = compilePipelinePlan({
    handlerName,
    requestKind: kind,
    handlerBehaviorTypes: declared.types,
    handlerOptions: declared.options,
    skippedBehaviorTypes: declared.skipped,
    globalBehaviors: settings.globalBehaviors,
  });
  const behaviors = plan.behaviorTypes.map(settings.behavior);
  if (plan.hasPipeline) {
    settings.log?.(
      `Wrapping ${handlerName}.${name}() [${kind}] with pipeline: [${plan.behaviorTypes.map((type) => type.name).join(' → ')}]`,
    );
  }
  if (settings.diagnostics) {
    validateBehaviorContracts({
      ...plan,
      handlerType,
      handlerName,
      requestKind: kind,
      resolvedBehaviors: new Map(behaviors.map((b, i) => [i, b])),
      diagnostics: settings.diagnostics,
    });
  }
  const run = createPipelineRunner(
    method,
    {
      handlerType,
      handlerName,
      requestKind: kind,
      behaviorOptions:
        plan.mergedOptions.size > 0 ? plan.mergedOptions : undefined,
    },
    behaviors,
    plan.hasPipeline,
    settings.sources,
  );
  return (request) => run(resolve(), request);
}

/**
 * The entry of a request class or, failing that, of its nearest parent class, as
 * NestJS CQRS finds handlers through class metadata.
 */
export function nearest<T>(
  entries: ReadonlyMap<RequestType, T>,
  type: object,
): T | undefined {
  for (
    let current = type;
    current !== Function.prototype;
    current = Object.getPrototypeOf(current)
  ) {
    const entry = entries.get(current as RequestType);
    if (entry) return entry;
  }
  return undefined;
}
