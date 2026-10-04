/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorEntry } from './entries.js';
import { normalizeBehaviorEntries } from './helpers/behavior-entries.js';
import type { BehaviorId } from './helpers/behavior-id.js';
import type { IPipelineBehavior } from './interfaces/pipeline.behavior.interface.js';
import type { Constructor } from './types.js';

const PIPELINE = Symbol.for('@cqrs-ddd/pipeline:handler-pipeline');
const SKIPPED = Symbol.for('@cqrs-ddd/pipeline:skipped');

/** A class, of a request or of a handler, whatever its constructor takes. */
// biome-ignore lint/suspicious/noExplicitAny: constructors take any arguments
export type AnyClass = abstract new (...args: any[]) => unknown;

/**
 * A class decorator for the standard and the `experimentalDecorators` mode: it receives
 * the class, and a context only in the standard mode.
 */
export type DualClassDecorator = (
  target: AnyClass,
  context?: ClassDecoratorContext,
) => void;

/** The pipeline a handler class declares with `@UsePipeline` and `@SkipPipeline`. */
export interface HandlerPipeline {
  readonly types: Constructor<IPipelineBehavior>[];
  readonly options: Map<BehaviorId, Record<string, unknown>>;
  readonly skipped: Constructor<IPipelineBehavior>[];
}

function define(target: AnyClass, key: symbol, value: unknown): void {
  Object.defineProperty(target, key, { value, configurable: true });
}

function read<T>(target: AnyClass, key: symbol): T | undefined {
  return (target as unknown as Record<symbol, T | undefined>)[key];
}

/**
 * Declares the behaviors that run around a handler, outermost first: behavior classes or
 * `[Behavior, options]` tuples such as `cache({ key })`. The global behaviors wrap these;
 * a behavior declared in both runs once, at its global position, with these options
 * merged over the global ones. The handler runtime reads the declaration with
 * {@link pipelineOf}.
 *
 * @throws TypeError on a malformed entry.
 * @example
 * ```ts
 * @CommandHandler(CreateUserCommand)
 * @UsePipeline(idempotent({ keyFactory }), audit({ action: 'user.create' }))
 * class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
 *   async execute(command: CreateUserCommand) {}
 * }
 * ```
 */
export function UsePipeline(
  ...entries: PipelineBehaviorEntry[]
): DualClassDecorator {
  return (target, context) => {
    const name = String(context?.name ?? target.name);
    const { types, options } = normalizeBehaviorEntries(
      entries,
      `@UsePipeline on ${name}`,
    );
    define(target, PIPELINE, { types, options });
  };
}

/**
 * Opts a handler out of global behaviors. Repeated decorators add up.
 *
 * @throws TypeError when an argument is not a behavior class.
 * @example
 * ```ts
 * @QueryHandler(HealthQuery)
 * @SkipPipeline(LoggingBehavior, TraceBehavior)
 * class HealthHandler implements IQueryHandler<HealthQuery> {
 *   async execute() {
 *     return 'ok';
 *   }
 * }
 * ```
 */
export function SkipPipeline(
  ...behaviors: Constructor<IPipelineBehavior>[]
): DualClassDecorator {
  return (target, context) => {
    const name = String(context?.name ?? target.name);
    const existing =
      read<Constructor<IPipelineBehavior>[]>(target, SKIPPED) ?? [];
    define(
      target,
      SKIPPED,
      normalizeBehaviorEntries(
        [...existing, ...behaviors],
        `@SkipPipeline on ${name}`,
        false,
      ).types,
    );
  };
}

/**
 * The pipeline a handler class declares; empty when it declares none. A subclass
 * inherits its parent's declaration until it declares its own.
 *
 * @example
 * ```ts
 * pipelineOf(CreateUserHandler).types; // [IdempotencyBehavior, AuditBehavior]
 * ```
 */
export function pipelineOf(handler: AnyClass): HandlerPipeline {
  const declared = read<Omit<HandlerPipeline, 'skipped'>>(handler, PIPELINE);
  return {
    types: declared?.types ?? [],
    options: declared?.options ?? new Map(),
    skipped: read<Constructor<IPipelineBehavior>[]>(handler, SKIPPED) ?? [],
  };
}
