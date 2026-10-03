---
title: "@cqrs-ddd/pipeline-feature-flags"
description: "Gate operations behind OpenFeature boolean flags, with sticky rollouts, variants and graceful fallbacks."
sidebar:
  order: 16
---

Runs an operation only while its boolean flag is on, through
[OpenFeature](https://openfeature.dev), so any OpenFeature provider works: Unleash,
Flagsmith, LaunchDarkly, flagd or a file. A disabled flag stops the operation before it
runs, with an error or with a fallback value.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-feature-flags @cqrs-ddd/pipeline @openfeature/server-sdk
```

Add the provider package of your flag service.

## Usage

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  createFeatureFlagClient,
  FeatureFlagBehavior,
  featureFlag,
} from '@cqrs-ddd/pipeline-feature-flags';

const client = await createFeatureFlagClient({ provider: new UnleashProvider(config) });
const pipeline = createPipeline({ behaviors: [new FeatureFlagBehavior(client)] });

export const checkout = pipeline.wrap(
  { name: 'checkout', kind: 'command' },
  featureFlag({ flag: 'new-checkout' }),
)(async (cart: Cart) => orders.place(cart));
```

`createFeatureFlagClient({ client, provider, domain, waitForReady })` returns the given
client, or registers the provider for the domain and resolves its client, waiting until the
provider is ready unless `waitForReady` is `false`. `releaseFeatureFlagProvider(options)`
unregisters that provider at shutdown.

The behavior's constructor takes the client, optional defaults, an optional evaluation
context added to every evaluation, an optional logger and an optional targeting key
factory used when an operation gives none.

## Options

| Option | Meaning | Default |
| --- | --- | --- |
| `flag` | the boolean flag that gates the operation; without it, the behavior does nothing | none |
| `defaultValue` | the value when the flag cannot be resolved | `false` (closed) |
| `fallback` | a value returned when the flag is off, instead of throwing | none: throws |
| `targetingKeyFactory` | the stable identity for percentage rollouts, such as the user id | the constructor's |
| `context` | extra evaluation context for this operation | none |
| `allowedVariants` | run only when the flag resolves to one of these variants | any |
| `errorPolicy` | `'use-default'` treats a provider error as `defaultValue`; `'throw'` raises `FeatureFlagEvaluationError` | `'use-default'` |

The correlation id is never used as a targeting key: it changes with every request and
would move a user between rollout groups.

```ts
featureFlag({
  flag: 'recommendations-v2',
  targetingKeyFactory: (ctx) => ctx.items.get('userId') as string | undefined,
  fallback: () => [],
});
```

`FEATURE_FLAG_DECISION_ITEM_TOKEN` records the evaluation (flag, value, variant, reason) for
later behaviors; `buildFeatureFlagAttributes` turns it into trace or audit attributes.

## HTTP errors

A disabled flag throws `FeatureDisabledError`. `toHttpResponse(error)` from
`@cqrs-ddd/pipeline-feature-flags/http` returns a 403 answer, or a 404 with
`{ hideFeature: true }` so that a client cannot tell a disabled feature from a missing one.
See [HTTP errors](/ddd-cqrs/guides/http-errors/).

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-feature-flags/)
