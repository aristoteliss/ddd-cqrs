/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type BehaviorResolver,
  type Constructor,
  type ContextSources,
  compileHandlerPlan,
  createHandlerRunner,
  type DeclaredKind,
  type GlobalBehaviorsOptions,
  type PipelineBehaviorDiagnostic,
} from '@cqrs-ddd/pipeline';
import type { RequestType } from './decorators.js';
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
  readonly behavior: BehaviorResolver;
  /** Receives contract violations; absent, contracts are not validated. */
  readonly diagnostics?: PipelineBehaviorDiagnostic[];
  /** Receives a line per handler that runs behaviors, naming them in order. */
  readonly log?: (message: string) => void;
}

/** A handler class, what gives its instance per request, and the kind it handles. */
export interface DeclaredHandler {
  readonly type: Constructor;
  readonly resolve: () => object;
  readonly kind: DeclaredKind;
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
  handler: DeclaredHandler,
  settings: PipelineSettings,
): Dispatch {
  const { type: handlerType, resolve, kind } = handler;
  const name = kind === 'event' ? 'handle' : 'execute';
  const method = Reflect.get(handlerType.prototype, name);
  if (typeof method !== 'function') throw new INVALID[kind]();
  const plan = compileHandlerPlan(handlerType, kind, settings.globalBehaviors);
  const run = createHandlerRunner({
    handlerType,
    kind,
    plan,
    method,
    behaviors: plan.behaviorTypes.map(settings.behavior),
    sources: settings.sources,
    diagnostics: settings.diagnostics,
    log: settings.log,
  });

  return (request) => run(resolve(), request);
}

/**
 * The entry of a request class or, failing that, of its nearest parent class.
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
