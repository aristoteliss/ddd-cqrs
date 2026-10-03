/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineLogger } from '@cqrs-ddd/pipeline';
import type { IDefaultPolicyContext } from 'cockatiel';
import { ResiliencePolicyConfigurationError } from './errors/resilience-policy-configuration.error.js';
import {
  type AnyPolicy,
  buildResiliencePolicy,
} from './helpers/policy-factory.js';
import type { ResiliencePolicyOptions } from './interfaces/resilience-options.interface.js';

/**
 * The named policies of the application, for outbound adapters: a payment API
 * client, an SMTP sender, a partner webhook.
 *
 * Every policy declared in the constructor's `options` is built once, when this registry is created at startup, and
 * shared by every caller — so a circuit breaker or bulkhead tracks the
 * dependency, whatever handler calls it. An invalid policy fails startup with
 * {@link ResiliencePolicyConfigurationError}.
 *
 * @example An adapter running its call through a shared policy
 * ```ts
 * export class PaymentsClient {
 *   constructor(private readonly policies: ResiliencePolicies) {}
 *
 *   charge(order: Order): Promise<Receipt> {
 *     return this.policies.execute('paymentsApi', ({ signal }) =>
 *       this.http.post('/charges', order, { signal }),
 *     );
 *   }
 * }
 * ```
 */
export class ResiliencePolicies {
  private readonly policies = new Map<string, AnyPolicy>();

  constructor(
    options?: Record<string, ResiliencePolicyOptions>,
    logger?: PipelineLogger,
  ) {
    const log = logger ?? console;
    for (const [name, policyOptions] of Object.entries(options ?? {})) {
      this.policies.set(name, buildNamedPolicy(name, policyOptions, log));
    }
  }

  /** The declared policy names, in declaration order. */
  get names(): readonly string[] {
    return [...this.policies.keys()];
  }

  /**
   * Returns the shared cockatiel policy declared under `name`.
   *
   * @throws ResiliencePolicyConfigurationError when no policy has that name.
   */
  get(name: string): AnyPolicy {
    const policy = this.policies.get(name);
    if (!policy) {
      const declared = this.names.length > 0 ? this.names.join(', ') : '(none)';
      throw new ResiliencePolicyConfigurationError(
        name,
        `no policy has this name; declared: ${declared}`,
      );
    }
    return policy;
  }

  /**
   * Runs `fn` through the policy declared under `name`. `fn` receives the
   * policy's `signal`, aborted on a cooperative timeout: pass it to the
   * outbound call so the call really stops. With a fallback, the fallback
   * value is returned in place of a handled failure.
   *
   * @throws ResiliencePolicyConfigurationError when no policy has that name.
   */
  execute<T>(
    name: string,
    fn: (context: IDefaultPolicyContext) => PromiseLike<T> | T,
  ): Promise<T> {
    return this.get(name).execute(fn) as Promise<T>;
  }
}

function buildNamedPolicy(
  name: string,
  options: ResiliencePolicyOptions,
  logger: PipelineLogger,
): AnyPolicy {
  const classifiesErrors =
    typeof options.handle === 'function' || options.handleAllErrors === true;
  if (
    (options.retry || options.circuitBreaker || options.fallback) &&
    !classifiesErrors
  ) {
    throw new ResiliencePolicyConfigurationError(
      name,
      'retry, circuitBreaker and fallback require handle(error) or handleAllErrors: true',
    );
  }

  const policy = buildResiliencePolicy(options, { logger, policyName: name });
  if (!policy) {
    throw new ResiliencePolicyConfigurationError(
      name,
      'it configures no layer (retry, circuitBreaker, bulkhead, timeout or fallback)',
    );
  }
  return policy;
}
