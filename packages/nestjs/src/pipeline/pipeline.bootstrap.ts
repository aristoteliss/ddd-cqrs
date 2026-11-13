/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type BehaviorId,
  type Constructor,
  type ContextSources,
  compileHandlerPlan,
  createHandlerRunner,
  type DeclaredKind,
  type DiagnosticsMode,
  type GlobalBehaviorsOptions,
  getBehaviorId,
  type IPipelineBehavior,
  type PipelineBehaviorDiagnostic,
  type PipelinePlan,
  reportDiagnostics,
} from '@cqrs-ddd/pipeline';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { CommandHandler, EventsHandler, QueryHandler } from '@nestjs/cqrs';

/** What every handler's pipeline shares; the options of `PipelineModule.forRoot()`. */
export interface PipelineModuleOptions {
  readonly globalBehaviors?: GlobalBehaviorsOptions | GlobalBehaviorsOptions[];
  readonly sources?: ContextSources;
  /** `'strict'` (default) fails startup on a contract violation, `'warn'` logs it. */
  readonly diagnostics?: DiagnosticsMode;
}

export const PIPELINE_OPTIONS = Symbol('PIPELINE_OPTIONS');

// The pipeline methods installed on handler instances, by any PipelineBootstrap.
const installed = new WeakSet<object>();

type Provider = ReturnType<DiscoveryService['getProviders']>[number];

/** A `@nestjs/cqrs` handler provider, its class and the kind its decorator declares. */
interface DiscoveredHandler {
  readonly provider: Provider;
  readonly type: Constructor;
  readonly kind: DeclaredKind;
}

// @nestjs/cqrs keeps its handler metadata keys private, so each public handler
// decorator is applied to a throwaway class to read the one key it records.
function metadataKey(decorate: (target: Constructor) => void): unknown {
  const target = class {};
  decorate(target);
  const keys: unknown[] = Reflect.getOwnMetadataKeys(target);

  if (keys.length !== 1) {
    throw new Error(
      'A @nestjs/cqrs handler decorator recorded no single metadata key; the installed @nestjs/cqrs is not supported.',
    );
  }

  return keys[0];
}

const HANDLER_KINDS: ReadonlyArray<[unknown, DeclaredKind]> = [
  [metadataKey((target) => CommandHandler(class {})(target)), 'command'],
  [metadataKey((target) => QueryHandler(class {})(target)), 'query'],
  [metadataKey((target) => EventsHandler(class {})(target)), 'event'],
];

/**
 * Wraps every `@nestjs/cqrs` handler that runs behaviors with its pipeline, at
 * application bootstrap: `execute` of command and query handlers, `handle` of
 * event handlers. The buses read the method at call time, so they dispatch
 * through the pipeline unchanged.
 *
 * A handler's pipeline comes from its `@UsePipeline`/`@SkipPipeline` and the
 * global behaviors, compiled once. Each behavior instance is the one provider a
 * module registers under the behavior class; this provider never builds one.
 * Startup fails when a behavior has no provider or several, when a handler that
 * runs behaviors is request-scoped (Nest builds such a handler per request, so a
 * wrapped instance would never run), and, in `'strict'` mode, when a behavior's
 * contract is broken. Only this application's own handler instances are wrapped,
 * never their class, and they are restored when the application closes.
 */
@Injectable()
export class PipelineBootstrap
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PipelineBootstrap.name);
  private readonly restores: Array<() => void> = [];

  constructor(
    private readonly discovery: DiscoveryService,
    @Inject(PIPELINE_OPTIONS) private readonly options: PipelineModuleOptions,
  ) {}

  onApplicationBootstrap(): void {
    try {
      this.wrapHandlers();
    } catch (error) {
      this.onModuleDestroy();
      throw error;
    }
  }

  onModuleDestroy(): void {
    while (this.restores.length > 0) this.restores.pop()?.();
  }

  private wrapHandlers(): void {
    const providers = this.discovery.getProviders();
    const mode = this.options.diagnostics ?? 'strict';
    const found: PipelineBehaviorDiagnostic[] = [];
    const behaviors = new Map<BehaviorId, IPipelineBehavior>();
    const behavior = (
      type: Constructor<IPipelineBehavior>,
      handler: string,
    ) => {
      const id = getBehaviorId(type);
      let instance = behaviors.get(id);
      if (!instance) {
        instance = registeredBehavior(providers, type, handler);
        behaviors.set(id, instance);
      }
      return instance;
    };

    for (const provider of providers) {
      const type = handlerType(provider);
      if (!type) continue;
      const declared = HANDLER_KINDS.filter(([key]) =>
        Reflect.getMetadata(key, type),
      );
      for (const [, kind] of declared) {
        this.wrap(
          { provider, type, kind },
          behavior,
          mode === 'off' ? undefined : found,
        );
      }
    }

    reportDiagnostics(found, mode, this.logger);
  }

  private wrap(
    handler: DiscoveredHandler,
    behavior: (
      type: Constructor<IPipelineBehavior>,
      handler: string,
    ) => IPipelineBehavior,
    diagnostics: PipelineBehaviorDiagnostic[] | undefined,
  ): void {
    const { provider, type, kind } = handler;
    const handlerName = type.name;
    const plan = compileHandlerPlan(type, kind, this.options.globalBehaviors);

    if (!plan.hasPipeline) return;
    if (!provider.isDependencyTreeStatic()) {
      throw new Error(
        `${handlerName} runs pipeline behaviors but is request-scoped, itself or through a dependency; ` +
          'Nest builds it per request, so its pipeline would never run. Make it a singleton and read ' +
          'request data from async context.',
      );
    }

    const resolved = plan.behaviorTypes.map((t) => behavior(t, handlerName));
    this.install(handler, { plan, behaviors: resolved, diagnostics });
  }

  /** Replaces the handler instance's method with its pipeline, restored on close. */
  private install(
    handler: DiscoveredHandler,
    pipeline: {
      plan: PipelinePlan;
      behaviors: IPipelineBehavior[];
      diagnostics: PipelineBehaviorDiagnostic[] | undefined;
    },
  ): void {
    const { provider, type, kind } = handler;
    const method = kind === 'event' ? 'handle' : 'execute';
    const instance = provider.instance as Record<string, unknown>;
    if (installed.has(instance[method] as object)) {
      throw new Error(
        `${type.name}.${method} already runs through a pipeline; import PipelineModule.forRoot() once.`,
      );
    }
    const run = createHandlerRunner({
      ...pipeline,
      handlerType: type,
      kind,
      method: instance[method] as (
        this: unknown,
        ...args: unknown[]
      ) => unknown,
      sources: this.options.sources,
      log: (message) => this.logger.debug(message),
    });
    const own = Object.getOwnPropertyDescriptor(instance, method);
    const piped = (request: unknown) => run(instance, request);
    installed.add(piped);
    Object.defineProperty(instance, method, {
      configurable: true,
      writable: true,
      value: piped,
    });
    this.restores.push(() => {
      if (own) Object.defineProperty(instance, method, own);
      else Reflect.deleteProperty(instance, method);
    });
  }
}

function handlerType(provider: Provider): Constructor | undefined {
  const type =
    (provider.instance as object | undefined)?.constructor ?? provider.metatype;
  return typeof type === 'function' && type !== Object
    ? (type as Constructor)
    : undefined;
}

function registeredBehavior(
  providers: readonly Provider[],
  type: Constructor<IPipelineBehavior>,
  handler: string,
): IPipelineBehavior {
  const id = getBehaviorId(type);
  const registered = providers.filter(
    ({ token }) =>
      token === type ||
      (typeof token === 'function' &&
        getBehaviorId(token as Constructor<IPipelineBehavior>) === id),
  );
  if (registered.length === 0) {
    throw new Error(
      `${type.name} runs in the pipeline of ${handler}, but no module provides it. Register it as a ` +
        'provider of the module that configures it.',
    );
  }
  if (registered.length > 1) {
    const modules = registered.map((p) => p.host?.name ?? 'an unknown module');
    throw new Error(
      `${type.name} is provided by ${modules.join(' and ')}; exactly one module provides each behavior, ` +
        'otherwise which instance a handler gets would depend on import order.',
    );
  }
  const [provider] = registered;
  if (!provider.isDependencyTreeStatic() || !provider.instance) {
    throw new Error(
      `${type.name} must be a singleton provider: a pipeline takes one instance of each behavior.`,
    );
  }
  return provider.instance as IPipelineBehavior;
}
