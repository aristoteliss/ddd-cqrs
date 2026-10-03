/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@cqrs-ddd/pipeline';
import type {
  Client,
  EvaluationContext,
  Provider,
} from '@openfeature/server-sdk';

/**
 * Builds an OpenFeature {@link EvaluationContext} from the current pipeline
 * request — letting flag targeting rules key off the live request/handler.
 */
export type EvaluationContextFactory = (
  context: IPipelineContext,
) => EvaluationContext;

/**
 * Resolves a stable OpenFeature targeting key from the current pipeline request.
 *
 * For percentage rollouts this should normally be a user, account, tenant or
 * device identifier that stays stable across requests.
 */
export type TargetingKeyFactory = (
  context: IPipelineContext,
) => string | undefined;

/**
 * Returns a fallback value to emit when the gating flag is disabled, instead of
 * throwing {@link FeatureDisabledError}. Receives the pipeline context so the
 * fallback can be request-aware.
 */
export type FeatureFallbackFactory = (
  context: IPipelineContext,
) => unknown | Promise<unknown>;

/** Controls how OpenFeature provider evaluation failures are handled. */
export type FeatureFlagErrorPolicy = 'use-default' | 'throw';

/**
 * Detailed result of a feature-flag evaluation, recorded on the pipeline
 * context so logging/audit/telemetry or later behaviors can inspect the exact
 * provider decision without re-evaluating the flag.
 */
export interface FeatureFlagDecision {
  /** Evaluated OpenFeature flag key. */
  flagKey: string;
  /** Raw boolean value returned by OpenFeature (or its configured default value). */
  value: boolean;
  /** Final gate decision after optional variant filtering. */
  enabled: boolean;
  /** Provider-selected variant, when the provider reports one. */
  variant?: string;
  /** OpenFeature resolution reason, when reported by the provider. */
  reason?: string;
  /** OpenFeature provider error code, if evaluation failed. */
  errorCode?: string;
  /** Provider error message, if evaluation failed. */
  errorMessage?: string;
  /** Stable targeting key used for this evaluation, if one was supplied. */
  targetingKey?: string;
}

/**
 * Per-handler feature-flag options, supplied through
 * `pipeline.wrap(options, [FeatureFlagBehavior, options])` and/or as defaults,
 * the second argument of the {@link FeatureFlagBehavior} constructor.
 */
export interface FeatureFlagBehaviorOptions {
  /**
   * Boolean flag key that gates the handler. When omitted the behavior is a
   * no-op (the handler always runs) — useful for setting only constructor defaults.
   */
  flag?: string;

  /**
   * Value used when the flag cannot be resolved (provider error, unknown key,
   * not yet ready). Defaults to `false` (fail-closed).
   */
  defaultValue?: boolean;

  /**
   * When the flag resolves to disabled, return this value instead of throwing
   * {@link FeatureDisabledError}. Use it to degrade gracefully, for example by
   * returning an empty read model or another explicitly supported fallback.
   */
  fallback?: FeatureFallbackFactory;

  /**
   * Builds extra OpenFeature targeting context for this handler, merged on top
   * of the base context (derived from the request) and the constructor's context.
   *
   * @example
   * ```ts
   * @pipeline.wrap({ kind: 'command' }, [FeatureFlagBehavior, {
   *   flag: 'new-checkout',
   *   context: (ctx) => ({
   *     plan: ctx.items.get('plan') as string,
   *     country: ctx.items.get('country') as string,
   *   }),
   * }])
   * ```
   */
  context?: EvaluationContextFactory;

  /**
   * Stable identity used for percentage rollouts / sticky targeting.
   *
   * Handler-level `targetingKeyFactory` overrides the constructor's resolver.
   * Correlation IDs are intentionally **not** used automatically because they
   * normally change on every request and can move the same user between rollout
   * cohorts.
   *
   * @example User-sticky rollout
   * ```ts
   * @pipeline.wrap({ kind: 'command' }, [FeatureFlagBehavior, {
   *   flag: 'new-checkout',
   *   targetingKeyFactory: (ctx) =>
   *     ctx.items.get('userId') as string | undefined,
   * }])
   * ```
   */
  targetingKeyFactory?: TargetingKeyFactory;

  /**
   * Optional allow-list of provider variants. When set, a boolean `true` only
   * enables the handler if the provider also resolved one of these variants.
   *
   * This is useful when one boolean flag carries named cohorts such as
   * `control`, `treatment-a`, and `treatment-b`.
   *
   * @example
   * ```ts
   * @pipeline.wrap({ kind: 'command' }, [FeatureFlagBehavior, {
   *   flag: 'checkout-experiment',
   *   allowedVariants: ['treatment-a'],
   * }])
   * ```
   */
  allowedVariants?: readonly string[];

  /**
   * Provider evaluation-error handling.
   *
   * - `use-default` — follow OpenFeature's default-value semantics and continue
   *   evaluating the final gate using `defaultValue` (default).
   * - `throw` — surface {@link FeatureFlagEvaluationError} instead of silently
   *   treating a provider failure like an ordinary disabled flag.
   *
   * @default 'use-default'
   */
  errorPolicy?: FeatureFlagErrorPolicy;
}

/** Where {@link createFeatureFlagClient} takes the OpenFeature client from. */
export interface FeatureFlagClientOptions {
  /**
   * Escape hatch: a fully constructed OpenFeature {@link Client}. Takes
   * precedence over {@link provider}.
   */
  client?: Client;

  /**
   * An OpenFeature {@link Provider} to register — e.g. an Unleash or Flagsmith
   * provider. Registered with `setProviderAndWait`, or `setProvider` when
   * {@link waitForReady} is `false`, before the client is resolved.
   */
  provider?: Provider;

  /**
   * OpenFeature domain (named client) to bind the provider/client to. Lets you
   * run multiple providers side by side. Defaults to the unnamed default client.
   */
  domain?: string;

  /**
   * Whether to await provider readiness via `setProviderAndWait`. Defaults to
   * `true`. Ignored when {@link client} is supplied.
   */
  waitForReady?: boolean;
}
