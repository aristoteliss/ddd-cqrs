/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { uuidv7 } from '@cqrs-ddd/uuidv7';
import {
  pipelineStore,
  SET_CORRELATION_ID,
  SET_RESPONSE,
  SET_TENANT_ID,
} from '../constants/pipeline-context.constants.js';
import type {
  ContextSource,
  ContextSources,
} from '../interfaces/context-source.interface.js';
import type {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface.js';
import type { PipelineHandlerMeta } from '../interfaces/pipeline-handler-meta.interface.js';
import { PipelineContext } from '../pipeline.context.js';

/**
 * Runs one execution: `request` is what behaviors see; `args`, when given, are the
 * arguments the handler receives instead of `request` alone.
 */
export type PipelineRunner = (
  self: unknown,
  request: unknown,
  args?: readonly unknown[],
) => Promise<unknown>;

/**
 * Builds the runner of one handler: each call creates a pipeline context, takes the
 * tenant and correlation id from `sources` or the enclosing pipeline, composes the
 * behaviors around the handler, and runs them inside those values. Framework adapters
 * use it; `createPipeline()` is the entry point for applications.
 *
 * @param behaviors - Resolved instances, or a resolver called per execution (a
 *   framework adapter's request-scoped instances).
 * @param meta - Fixed handler metadata, or a function deriving it from the request and
 *   the receiver of the call.
 * @example
 * ```ts
 * const run = createPipelineRunner(handler.execute, meta, [logging], true, sources);
 * await run(handler, command);
 * ```
 */
export function createPipelineRunner(
  // biome-ignore lint/suspicious/noExplicitAny: the handler's arguments are opaque here
  originalMethod: (this: unknown, ...args: any[]) => unknown,
  meta:
    | PipelineHandlerMeta
    | ((request: unknown, self: unknown) => PipelineHandlerMeta),
  behaviors:
    | readonly IPipelineBehavior[]
    | ((self: unknown, request: unknown) => Promise<IPipelineBehavior[]>),
  hasPipeline: boolean,
  sources: ContextSources = {},
): PipelineRunner {
  const invoke = (
    self: unknown,
    request: unknown,
    args?: readonly unknown[],
  ) =>
    args
      ? originalMethod.apply(self, [...args])
      : originalMethod.call(self, request);
  return async (self, request, args) => {
    if (!hasPipeline) return invoke(self, request, args);
    const context = new PipelineContext(
      request,
      typeof meta === 'function' ? meta(request, self) : meta,
    );
    const localBehaviors =
      typeof behaviors === 'function'
        ? await behaviors(self, request)
        : behaviors;
    const parent = pipelineStore.getStore();
    const { tenantId: tenant, correlationId: correlation } = sources;
    const tenantId = tenant ? tenant.current() : parent?.tenantId;
    const correlationId = correlation
      ? (correlation.current() ?? correlation.create())
      : (parent?.correlationId ?? uuidv7());
    context[SET_CORRELATION_ID](correlationId);
    if (tenantId !== undefined) context[SET_TENANT_ID](tenantId);

    let chain: NextDelegate = async () => {
      // A behavior that replaced the request hands the handler the replacement.
      const current = context.request;
      const replaced = current !== request;
      const result = await invoke(
        self,
        current,
        args && replaced
          ? args.length === 1
            ? [current]
            : (current as unknown[])
          : args,
      );
      context[SET_RESPONSE](result);
      return result;
    };

    for (let i = localBehaviors.length - 1; i >= 0; i--) {
      const behavior = localBehaviors[i];
      const nextInChain = chain;
      chain = () => behavior.handle(context, nextInChain);
    }

    // Behaviors and the handler run inside this execution's values, so a
    // nested dispatch inherits them and cannot see a different tenant.
    return pipelineStore.run(context, () =>
      within(tenant, context.tenantId, () =>
        within(correlation, context.correlationId, chain),
      ),
    );
  };
}

function within<T>(
  source: ContextSource | undefined,
  value: string | undefined,
  fn: () => T,
): T {
  return source ? source.run(value, fn) : fn();
}
