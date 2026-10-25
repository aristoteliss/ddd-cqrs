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

/** The dispatch tables handlers join, and what their pipelines are built with. */
export interface Registry {
  readonly handlers: Handlers;
  readonly behavior: PipelineSettings['behavior'];
  readonly options: RegistrationOptions;
  readonly logger: PipelineLogger;
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
  registry: Registry,
  entries: readonly HandlerEntry[],
): void {
  const { handlers, behavior, options, logger } = registry;

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

    if (command) {
      bind(
        handlers.commands,
        { kind: 'command', request: command, type, resolve },
        settings,
      );
    }
    if (query) {
      bind(
        handlers.queries,
        { kind: 'query', request: query, type, resolve },
        settings,
      );
    }
    if (events) {
      const run = toDispatch({ type, resolve, kind: 'event' }, settings);
      subscribe(handlers.events, events, { name: type.name, run });
    }
  }
  report(found, mode, logger);
}

function subscribe(
  table: Map<RequestType, EventSubscriber[]>,
  events: Iterable<RequestType>,
  subscriber: EventSubscriber,
): void {
  for (const event of events) {
    const subscribers = table.get(event) ?? [];
    table.set(event, [...subscribers, subscriber]);
  }
}

/** Throws the contract violations in `'strict'` mode, else logs each one. */
function report(
  found: PipelineBehaviorDiagnostic[],
  mode: NonNullable<RegistrationOptions['diagnostics']>,
  logger: PipelineLogger,
): void {
  if (found.length > 0 && mode === 'strict') {
    throw new PipelineConfigurationError(found);
  }
  for (const d of found) {
    logger.warn(
      `[Pipeline Diagnostic] Handler '${d.handlerName}' with behavior '${d.behaviorName}': ${d.message}. Fix: ${d.fix}`,
    );
  }
}

/** A command or query handler, with the request class it handles. */
interface HandlerBinding extends HandlerEntry {
  readonly kind: 'command' | 'query';
  readonly request: RequestType;
}

function bind(
  table: Map<RequestType, Dispatch>,
  binding: HandlerBinding,
  settings: PipelineSettings,
): void {
  const { kind, request, type } = binding;
  if (table.has(request)) {
    throw new TypeError(
      `${request.name} has a second ${kind} handler, ${type.name}; a ${kind} has exactly one.`,
    );
  }
  table.set(request, toDispatch(binding, settings));
}
