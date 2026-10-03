/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Constructor } from '../types.js';
import type { IPipelineBehavior } from './pipeline.behavior.interface.js';

/**
 * Well-known symbol for declaring an optional {@link IPipelineBehaviorContract}
 * on a pipeline behavior class.
 */
export const PIPELINE_BEHAVIOR_CONTRACT = Symbol.for(
  '@cqrs-ddd/pipeline:behavior-contract',
);

/**
 * Inspection context provided to behavior contract validators before the first
 * execution: when a function is wrapped, or when an adapter starts.
 */
export interface PipelineBehaviorValidationContext {
  /** The CQRS handler class. */
  handlerType: Constructor;
  /** The name of the CQRS handler. */
  handlerName: string;
  /** The request kind of the handler ('command' | 'query' | 'event'). */
  requestKind: 'command' | 'query' | 'event';
  /**
   * Source where this behavior was declared for the current handler:
   * - `'handler'`: declared at the call site, such as `pipeline.wrap(options, ...entries)`.
   * - `'global'`: declared globally, such as `createPipeline({ globalBehaviors })`.
   * - `'both'`: declared globally and also customized at the call site.
   */
  declarationSource: 'handler' | 'global' | 'both';
  /** Effective options for resolved singletons; raw handler/global options for scoped behaviors. */
  effectiveOptions: Record<string, unknown> | undefined;
  /** Raw options declared on the handler, if any. */
  handlerOptions: Record<string, unknown> | undefined;
  /** Raw options declared globally, if any. */
  globalOptions: Record<string, unknown> | undefined;
  /** Complete ordered list of effective behavior classes active for this handler. */
  effectiveBehaviorTypes: ReadonlyArray<Constructor<IPipelineBehavior>>;
  /** The behavior instance, when one exists before the first execution. */
  behaviorInstance?: IPipelineBehavior;
}

/**
 * A diagnostic issue identified when a pipeline behavior contract is validated.
 */
export interface PipelineBehaviorDiagnostic {
  /** The name of the handler where the issue occurred. */
  handlerName: string;
  /** The name of the behavior that emitted the diagnostic. */
  behaviorName: string;
  /** Actionable explanation of the invalid or missing configuration. */
  message: string;
  /** Concrete remediation recommendation to resolve the issue. */
  fix: string;
}

/**
 * Static ordering constraints relative to other pipeline behaviors.
 *
 * These are **relative-position** constraints, not dependency declarations. A
 * target that is absent from the handler's effective chain produces no
 * diagnostic, because there is no position to violate. `after: [CaslBehavior]`
 * therefore means "must not run before `CaslBehavior` when it is present", not
 * "`CaslBehavior` must be present".
 *
 * To require a peer, check {@link PipelineBehaviorValidationContext.effectiveBehaviorTypes}
 * in {@link IPipelineBehaviorContract.validate} and return a diagnostic when it
 * is missing. Ordering alone cannot express that.
 */
export interface PipelineBehaviorOrderRule {
  /** This behavior must execute before the specified behaviors, when present. */
  before?: Array<Constructor<IPipelineBehavior> | string>;
  /** This behavior must execute after the specified behaviors, when present. */
  after?: Array<Constructor<IPipelineBehavior> | string>;
}

/**
 * Ordering specification: either a static rule or a dynamic rule evaluated per handler context.
 */
export type PipelineBehaviorOrder =
  | PipelineBehaviorOrderRule
  | ((
      context: PipelineBehaviorValidationContext,
    ) => PipelineBehaviorOrderRule | undefined);

/**
 * Declarative contract exposed by a behavior class to define ordering constraints
 * and validation rules checked before the first execution.
 */
export interface IPipelineBehaviorContract {
  /**
   * Relative ordering constraints against other behaviors in the pipeline.
   * Targets can be behavior classes or behavior ID / class names (strings).
   * Can be a static rule or a function evaluated with the handler context
   * to restrict constraints to applicable request kinds or configurations.
   */
  order?: PipelineBehaviorOrder;
  /**
   * Validates effective options and declaration sources before the first execution.
   * Returns an array of diagnostics if deterministic misconfigurations are found.
   */
  validate?: (
    context: PipelineBehaviorValidationContext,
  ) => PipelineBehaviorDiagnostic[] | undefined;
}

/**
 * Thrown when a function is wrapped, or when an adapter starts, if deterministic
 * pipeline policy misconfigurations or ordering violations are detected.
 */
export class PipelineConfigurationError extends Error {
  constructor(
    public readonly diagnostics: readonly PipelineBehaviorDiagnostic[],
  ) {
    const formatted = diagnostics
      .map(
        (d, idx) =>
          `  ${idx + 1}. [${d.handlerName} -> ${d.behaviorName}] ${d.message}. Fix: ${d.fix}`,
      )
      .join('\n');
    super(
      `Pipeline configuration invalid with ${diagnostics.length} error(s):\n${formatted}`,
    );
    this.name = 'PipelineConfigurationError';
  }
}
