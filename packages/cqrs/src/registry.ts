/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type BehaviorId,
  behaviorEntryType,
  type Constructor,
  type ContextSources,
  type GlobalBehaviorsOptions,
  getBehaviorId,
  type IPipelineBehavior,
  LoggingBehavior,
  type LogLevel,
  type PipelineBehaviorDiagnostic,
  PipelineConfigurationError,
  type PipelineLogger,
  toGlobalConfigs,
} from '@cqrs-ddd/pipeline';
import {
  commandOf,
  eventsOf,
  queryOf,
  type RequestType,
} from './decorators.js';
import {
  type Dispatch,
  type PipelineSettings,
  toDispatch,
} from './dispatch.js';
import type { EventSubscriber } from './event.bus.js';

/** The dispatch tables the buses read, filled as handlers register. */
export class Handlers {
  readonly commands = new Map<RequestType, Dispatch>();
  readonly queries = new Map<RequestType, Dispatch>();
  readonly events = new Map<RequestType, EventSubscriber[]>();
}

/** How every handler's pipeline is built. */
export interface RegistrationOptions {
  readonly globalBehaviors?: GlobalBehaviorsOptions | GlobalBehaviorsOptions[];
  readonly sources?: ContextSources;
  readonly diagnostics?: 'strict' | 'warn' | 'off';
  readonly bootstrapLogLevel?: LogLevel | 'none';
}

/** A handler to register: its class, and what gives the instance per request. */
export interface HandlerEntry {
  readonly type: Constructor;
  readonly resolve: () => object;
}

const LOGGING_ID = getBehaviorId(LoggingBehavior);

/**
 * The one instance of each behavior class: the instance given for that class, else
 * `LoggingBehavior` on the logger, else one built with no arguments. The global behaviors
 * are built here, so one that cannot be built fails at once.
 *
 * @throws TypeError on two given instances of one behavior class.
 */
export function behaviorResolver(
  given: readonly IPipelineBehavior[],
  globalBehaviors: RegistrationOptions['globalBehaviors'],
  logger: PipelineLogger,
): PipelineSettings['behavior'] {
  const instances = new Map<BehaviorId, IPipelineBehavior>();
  for (const instance of given) {
    const type = instance.constructor as Constructor<IPipelineBehavior>;
    const id = getBehaviorId(type);
    if (instances.has(id)) {
      throw new TypeError(
        `createCqrs: two instances of ${type.name}; pass one per behavior class.`,
      );
    }
    instances.set(id, instance);
  }
  const behavior = (type: Constructor<IPipelineBehavior>) => {
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
      behavior(behaviorEntryType(entry, 'globalBehaviors'));
    }
  }
  return behavior;
}

/**
 * Compiles each handler's pipeline once and adds it to the dispatch tables. Contract
 * violations throw a `PipelineConfigurationError` in `'strict'` mode, are logged in
 * `'warn'` mode, and are not checked in `'off'` mode.
 *
 * @throws TypeError on a second command or query handler.
 */
export function registerHandlers(
  handlers: Handlers,
  entries: readonly HandlerEntry[],
  behavior: PipelineSettings['behavior'],
  options: RegistrationOptions,
  logger: PipelineLogger,
): void {
  const mode = options.diagnostics ?? 'strict';
  const level = options.bootstrapLogLevel ?? 'debug';
  const found: PipelineBehaviorDiagnostic[] = [];
  const settings: PipelineSettings = {
    globalBehaviors: options.globalBehaviors,
    sources: options.sources,
    behavior,
    diagnostics: mode === 'off' ? undefined : found,
    log: level === 'none' ? undefined : (message) => logger[level]?.(message),
  };
  for (const { type, resolve } of entries) {
    const command = commandOf(type);
    const query = queryOf(type);
    const events = eventsOf(type);
    if (command)
      bind(handlers.commands, 'command', command, type, resolve, settings);
    if (query) bind(handlers.queries, 'query', query, type, resolve, settings);
    if (events) {
      const run = toDispatch(type, resolve, 'event', settings);
      for (const event of events) {
        const subscribers = handlers.events.get(event) ?? [];
        handlers.events.set(event, [...subscribers, { name: type.name, run }]);
      }
    }
  }
  if (found.length > 0 && mode === 'strict') {
    throw new PipelineConfigurationError(found);
  }
  for (const d of found) {
    logger.warn(
      `[Pipeline Diagnostic] Handler '${d.handlerName}' with behavior '${d.behaviorName}': ${d.message}. Fix: ${d.fix}`,
    );
  }
}

function bind(
  table: Map<RequestType, Dispatch>,
  kind: 'command' | 'query',
  request: RequestType,
  type: Constructor,
  resolve: () => object,
  settings: PipelineSettings,
): void {
  if (table.has(request)) {
    throw new TypeError(
      `${request.name} has a second ${kind} handler, ${type.name}; a ${kind} has exactly one.`,
    );
  }
  table.set(request, toDispatch(type, resolve, kind, settings));
}
