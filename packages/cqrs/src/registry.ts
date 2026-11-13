/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type Constructor,
  type ContextSources,
  type DiagnosticsMode,
  type GlobalBehaviorsOptions,
  type LogLevel,
  type PipelineBehaviorDiagnostic,
  type PipelineLogger,
  reportDiagnostics,
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
  readonly diagnostics?: DiagnosticsMode;
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
  reportDiagnostics(found, mode, logger);
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
