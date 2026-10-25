/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { untyped } from '@cqrs-ddd/untyped';
import { type BehaviorId, getBehaviorId } from '../helpers/behavior-id.js';
import type {
  IPipelineBehavior,
  IPipelineBehaviorOptionsResolver,
} from '../interfaces/pipeline.behavior.interface.js';
import {
  type IPipelineBehaviorContract,
  PIPELINE_BEHAVIOR_CONTRACT,
  type PipelineBehaviorDiagnostic,
  type PipelineBehaviorOrderRule,
  type PipelineBehaviorValidationContext,
} from '../interfaces/pipeline-behavior-contract.interface.js';
import type { Constructor } from '../types.js';

/**
 * Validates the ordering rules and option contracts that behavior classes declare
 * through `PIPELINE_BEHAVIOR_CONTRACT`, appending a diagnostic per violation. Framework
 * adapters call it at bootstrap; `createPipeline()` calls it when a function is wrapped.
 *
 * @example
 * ```ts
 * const diagnostics: PipelineBehaviorDiagnostic[] = [];
 * validateBehaviorContracts({ ...plan, handlerType, handlerName, requestKind, resolvedBehaviors, diagnostics });
 * ```
 */
export function validateBehaviorContracts(params: {
  handlerType: Constructor;
  handlerName: string;
  requestKind: 'command' | 'query' | 'event';
  behaviorTypes: Constructor<IPipelineBehavior>[];
  resolvedBehaviors: Map<number, IPipelineBehavior>;
  mergedOptions: Map<BehaviorId, Record<string, unknown>>;
  handlerOptions?: Map<BehaviorId, Record<string, unknown>>;
  globalOptions: Map<BehaviorId, Record<string, unknown>>;
  handlerBehaviorTypes?: Constructor<IPipelineBehavior>[];
  globalBehaviorIds: Set<BehaviorId>;
  diagnostics: PipelineBehaviorDiagnostic[];
}): void {
  const { behaviorTypes, resolvedBehaviors, diagnostics } = params;

  for (let i = 0; i < behaviorTypes.length; i++) {
    const BehaviorClass = behaviorTypes[i];
    const id = getBehaviorId(BehaviorClass);
    const instance = resolvedBehaviors.get(i);
    const contract = contractOf(BehaviorClass, instance);
    if (!contract) continue;

    const validationCtx = validationContextOf(params, id, instance);

    // 1. Validate ordering constraints
    const orderRule =
      typeof contract.order === 'function'
        ? contract.order(validationCtx)
        : contract.order;
    if (orderRule) {
      validateOrder(params, { index: i, type: BehaviorClass }, orderRule);
    }

    // 2. Validate behavior options and intent
    if (typeof contract.validate !== 'function') continue;

    const result = contract.validate(validationCtx);
    if (Array.isArray(result)) diagnostics.push(...result);
  }
}

type ContractValidation = Parameters<typeof validateBehaviorContracts>[0];

/** A behavior class and its index in the effective chain. */
interface PlacedBehavior {
  index: number;
  type: Constructor<IPipelineBehavior>;
}

interface OrderEdge {
  target: Constructor<IPipelineBehavior> | string;
  direction: 'after' | 'before';
}

function contractOf(
  type: Constructor<IPipelineBehavior>,
  instance: IPipelineBehavior | undefined,
): IPipelineBehaviorContract | undefined {
  return (
    (instance &&
      (untyped(instance)[PIPELINE_BEHAVIOR_CONTRACT] as
        | IPipelineBehaviorContract
        | undefined)) ??
    (untyped(type)[PIPELINE_BEHAVIOR_CONTRACT] as
      | IPipelineBehaviorContract
      | undefined)
  );
}

function validationContextOf(
  params: ContractValidation,
  id: BehaviorId,
  instance: IPipelineBehavior | undefined,
): PipelineBehaviorValidationContext {
  const {
    handlerType,
    handlerName,
    requestKind,
    behaviorTypes,
    mergedOptions,
    handlerOptions,
    globalOptions,
  } = params;
  const declarationSource = declarationSourceOf(params, id);
  const rawMerged = mergedOptions.get(id);
  const effectiveOptions =
    instance && resolvesOptions(instance)
      ? instance.resolveEffectiveOptions(rawMerged)
      : rawMerged;

  return {
    handlerType,
    handlerName: handlerName,
    requestKind,
    declarationSource,
    effectiveOptions,
    handlerOptions: handlerOptions?.get(id),
    globalOptions: globalOptions.get(id),
    effectiveBehaviorTypes: behaviorTypes,
    behaviorInstance: instance,
  };
}

function declarationSourceOf(
  params: ContractValidation,
  id: BehaviorId,
): PipelineBehaviorValidationContext['declarationSource'] {
  const isHandlerDeclared = (params.handlerBehaviorTypes ?? []).some(
    (t) => getBehaviorId(t) === id,
  );
  const isGlobalDeclared = params.globalBehaviorIds.has(id);
  if (isHandlerDeclared && isGlobalDeclared) return 'both';
  return isHandlerDeclared ? 'handler' : 'global';
}

function validateOrder(
  params: ContractValidation,
  behavior: PlacedBehavior,
  orderRule: PipelineBehaviorOrderRule,
): void {
  const { handlerName, behaviorTypes, diagnostics } = params;
  const { index: i, type: BehaviorClass } = behavior;

  for (const { target, direction } of edgesOf(orderRule)) {
    const targetIdx = behaviorTypes.findIndex((b) => isTarget(b, target));

    // Relative position only: an absent target has no position to
    // violate. A behavior that needs a peer to exist checks
    // effectiveBehaviorTypes in its own validate().
    if (targetIdx === -1) continue;

    const isViolation = direction === 'after' ? i <= targetIdx : i >= targetIdx;
    if (!isViolation) continue;

    const targetName = behaviorTypes[targetIdx].name;
    diagnostics.push({
      handlerName: handlerName,
      behaviorName: BehaviorClass.name,
      message:
        direction === 'after'
          ? `${BehaviorClass.name} is positioned before ${targetName} in the pipeline chain, but must execute after it`
          : `${BehaviorClass.name} is positioned after ${targetName} in the pipeline chain, but must execute before it`,
      fix:
        direction === 'after'
          ? `Reorder the pipeline behaviors so that ${targetName} runs before ${BehaviorClass.name}.`
          : `Reorder the pipeline behaviors so that ${BehaviorClass.name} runs before ${targetName}.`,
    });
  }
}

function edgesOf(orderRule: PipelineBehaviorOrderRule): OrderEdge[] {
  const edges: OrderEdge[] = [];
  if (orderRule.after) {
    for (const target of orderRule.after) {
      edges.push({ target, direction: 'after' });
    }
  }
  if (orderRule.before) {
    for (const target of orderRule.before) {
      edges.push({ target, direction: 'before' });
    }
  }
  return edges;
}

function isTarget(
  type: Constructor<IPipelineBehavior>,
  target: OrderEdge['target'],
): boolean {
  return typeof target === 'string'
    ? getBehaviorId(type) === target || type.name === target
    : type === target || getBehaviorId(type) === getBehaviorId(target);
}

function resolvesOptions(
  instance: IPipelineBehavior,
): instance is IPipelineBehavior & IPipelineBehaviorOptionsResolver {
  return (
    typeof (instance as Partial<IPipelineBehaviorOptionsResolver>)
      .resolveEffectiveOptions === 'function'
  );
}
