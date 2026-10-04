---
title: "@cqrs-ddd/pipeline-opentelemetry"
description: "OpenTelemetry spans, metrics και decision attributes για κάθε διακοσμημένη λειτουργία pipeline."
sidebar:
  order: 19
---

OpenTelemetry instrumentation για λειτουργίες wrapped από pipelines:

- Το `TraceBehavior` ανοίγει ένα span ανά εκτέλεση.
- Το `MetricsBehavior` καταγράφει διάρκειες, πλήθος κλήσεων και ενεργές εκτελέσεις σε εξέλιξη (in-flight).
- Το `AttributesBehavior` τοποθετεί στο span τις αποφάσεις άλλων behaviors (cache hit, idempotent replay, rate limit, feature flag), μέσω των factories `build<Name>Attributes` των αντίστοιχων πακέτων τους.

Το πακέτο εξαρτάται αποκλειστικά από το `@opentelemetry/api`. Η εφαρμογή ρυθμίζει το SDK. Χωρίς καταχωρημένο SDK, το API επιστρέφει no-op tracers/meters.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/pipeline-opentelemetry @cqrs-ddd/pipeline @opentelemetry/api
```

## Χρήση

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import { buildCacheAttributes } from '@cqrs-ddd/pipeline-cache';
import {
  AttributesBehavior,
  MetricsBehavior,
  TraceBehavior,
} from '@cqrs-ddd/pipeline-opentelemetry';

const pipeline = createPipeline({
  behaviors: [new MetricsBehavior(console)],
  globalBehaviors: {
    before: [
      [TraceBehavior, { tracerName: 'shop' }],
      [MetricsBehavior, { meterName: 'shop' }],
      [AttributesBehavior, { factories: [buildCacheAttributes] }],
    ],
  },
});
```

Τα `TraceBehavior` και `AttributesBehavior` δεν απαιτούν ορίσματα constructor. Το `MetricsBehavior` δέχεται προαιρετικό logger. Τα `trace(options)` και `metrics(options)` κατασκευάζουν τις καταχωρίσεις τους.

## Traces

| Επιλογή | Σημασία | Προεπιλογή |
| --- | --- | --- |
| `tracerName` | όνομα scope του tracer | `'@cqrs-ddd/pipeline-opentelemetry'` |
| `enabled` | άνοιγμα span για τη λειτουργία | `true` |
| `spanName` | string ή συνάρτηση του context | `{requestKind}.{requestName}` (π.χ. `query.getPrice`) |
| `attributeFactory` | επιπλέον span attributes από το context | κανένα |
| `recordException` | καταγραφή σφάλματος στο span | `true` |

## Metrics

| Όργανο (Instrument) | Τύπος |
| --- | --- |
| `pipeline.handler.duration` | histogram, σε milliseconds |
| `pipeline.handler.invocations` | counter, μία φορά ανά ολοκληρωμένη κλήση |
| `pipeline.handler.active` | in-flight εκτελέσεις |

| Επιλογή | Σημασία | Προεπιλογή |
| --- | --- | --- |
| `meterName` | όνομα scope του meter | `'@cqrs-ddd/pipeline-opentelemetry'` |
| `enabled` | καταγραφή μετρικών για τη λειτουργία | `true` |
| `attributeFactory` | επιπλέον labels από το context (χαμηλής πληθικότητας) | κανένα |
| `includeContextAttributes` | προσθήκη του τοπικού attribute bag στα labels | `false` |

## Attributes

Τα ονόματα περιλαμβάνονται στο `PIPELINE_OTEL_ATTRIBUTES`: `pipeline.request.kind`, `pipeline.request.name`, `pipeline.handler.name`, `pipeline.correlation_id`, `pipeline.tenant_id`, `pipeline.outcome` και `error.type`. Ένα custom behavior μπορεί να προσθέσει attributes με το `addPipelineTelemetryAttributes()`.

## Σειρά τοποθέτησης (Ordering)

Τοποθετήστε τα `TraceBehavior` και `MetricsBehavior` πρώτα (εξωτερικά), ώστε να καλύπτουν κάθε άλλο behavior. Τοποθετήστε το `AttributesBehavior` στο εσωτερικό τους αλλά εξωτερικά από τα behaviors που περιγράφει: εκτελεί τα factories του κατά το ξετύλιγμα της αλυσίδας (unwinding), όταν κάθε εσωτερικό behavior έχει ήδη εκδώσει την απόφασή του.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-opentelemetry/)
