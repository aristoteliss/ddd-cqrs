---
title: "@cqrs-ddd/pipeline-resilience"
description: "Retry, timeout και bulkhead γύρω από λειτουργίες, και named policies για εξωτερικές εξαρτήσεις, βασισμένα στο cockatiel."
sidebar:
  order: 15
---

Πολιτικές ανοχής σφαλμάτων και αξιοπιστίας βασισμένες στο [cockatiel](https://github.com/connor4312/cockatiel), εφαρμοζόμενες σε δύο διακριτά αρχιτεκτονικά επίπεδα:

1. **Ανθεκτικότητα σε επίπεδο λειτουργίας (`ResilienceBehavior`)**: Περιβάλλει ολόκληρους handlers ή μεμονωμένες λειτουργίες με απομόνωση **retry**, **timeout** και **bulkhead**.
2. **Πολιτικές εξωτερικών εξαρτήσεων (`ResiliencePolicies`)**: Ένα κεντρικό μητρώο επώνυμων πολιτικών ανθεκτικότητας (**circuit breakers**, **retry**, **bulkhead**, **timeout**, **fallback**) για κλήσεις RPC, payment APIs, database queries και εξωτερικά webhooks.

Επιβάλλει αυστηρούς ελέγχους κατά το startup προς αποφυγή επικίνδυνων επανεκτελέσεων εντολών με παρενέργειες.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/pipeline-resilience @cqrs-ddd/pipeline
```

Απαιτεί Node.js 22.12 ή νεότερο. Περιλαμβάνει το `cockatiel` 4 ως εξάρτηση.

## Δύο αρχιτεκτονικά επίπεδα

```text
Εισερχόμενο Command / Query
      │
      ▼
[ResilienceBehavior] (Επίπεδο Λειτουργίας)
  ├─ Bulkhead: Περιορίζει τις ταυτόχρονες εκτελέσεις στον συγκεκριμένο handler
  ├─ Timeout: Θέτει ανώτατο όριο στον συνολικό χρόνο εκτέλεσης του handler
  └─ Retry: Επανεκτελεί τη λειτουργία (σε commands και events μόνο με replaySafe)
         │
         ▼
[Επιχειρησιακή Λογική Handler]
         │
         ▼ Εξερχόμενη Απομακρυσμένη Κλήση (π.χ. Stripe, AWS S3, SendGrid)
[ResiliencePolicies] (Επίπεδο Εξάρτησης)
  ├─ Circuit Breaker: Ανοίγει σε διαδοχικές αποτυχίες του εξωτερικού συστήματος
  ├─ Outbound Timeout: Περιορίζει τη διάρκεια του HTTP socket
  ├─ Outbound Retry: Επαναλαμβάνει παροδικές πτώσεις σύνδεσης
  └─ Fallback: Επιστρέφει cached ή υποβαθμισμένη απάντηση σε διακοπή
```

## Χρήση σε επίπεδο λειτουργίας (`ResilienceBehavior`)

```typescript
import { createPipeline } from '@cqrs-ddd/pipeline';
import { resilience, getResilienceAbortSignal } from '@cqrs-ddd/pipeline-resilience';

const pipeline = createPipeline();

export const fetchRemotePrice = pipeline.wrap(
  { name: 'fetchRemotePrice', kind: 'query' },
  resilience({
    retry: {
      maxAttempts: 3,
      backoff: { type: 'exponential', initialDelay: 200, maxDelay: 2_000 },
    },
    timeout: { duration: 3_000, strategy: 'cooperative' },
    bulkhead: { limit: 20, queue: 10 },
    handle: (error) => error instanceof UpstreamNetworkError,
  }),
)(async (sku: string) => {
  const signal = getResilienceAbortSignal();
  return pricingApi.getPrice(sku, { signal });
});
```

### Invariants ασφαλείας & Έλεγχοι

Επειδή τα retries επανεκτελούν ολόκληρο το περιεχόμενο του behavior, το `ResilienceBehavior` επικυρώνει αυστηρούς κανόνες:

1. **Επιλεκτικό φίλτρο σφαλμάτων (`handle`)**: Απαιτείται ρητή συνάρτηση `handle: (error) => boolean` που επιλέγει παροδικά σφάλματα (πτώσεις δικτύου, deadlocks). Για επανάληψη σε όλα τα σφάλματα, απαιτείται `handleAllErrors: true`.
2. **Ασφάλεια επανάληψης σε Commands/Events (`retry.replaySafe`)**: Commands και events μεταβάλλουν κατάσταση. Η ρύθμιση retry σε command χωρίς ρητό `retry: { replaySafe: true }` αποτυγχάνει κατά την εκκίνηση με `PipelineConfigurationError`.
3. **Στρατηγική Timeout (`timeout.strategy`)**:
   - `'aggressive'` (προεπιλογή): Απαντά άμεσα στον καλούντα με σφάλμα timeout ενώ ο handler συνεχίζει να εκτελείται στο background. Σε commands ή events απαιτεί `timeout: { replaySafe: true }`.
   - `'cooperative'`: Ακυρώνει το `AbortSignal` από το `getResilienceAbortSignal()` και περιμένει τον handler να ολοκληρώσει πριν απαντήσει.
4. **Όχι Circuit Breakers σε Use Cases**: Η δήλωση circuit breaker απευθείας σε έναν handler απορρίπτεται. Τα circuit breakers παρακολουθούν την υγεία εξωτερικών εξαρτήσεων και όχι τα εσωτερικά use cases. Δηλώνονται στο `ResiliencePolicies`.

## Πολιτικές εξωτερικών εξαρτήσεων (`ResiliencePolicies`)

Κεντρικό μητρώο επώνυμων πολιτικών για εξωτερικά συστήματα:

```typescript
import { ResiliencePolicies } from '@cqrs-ddd/pipeline-resilience';

export const externalPolicies = new ResiliencePolicies({
  paymentGateway: {
    handle: (error) => isTransientHttpError(error),
    retry: { maxAttempts: 2, backoff: { type: 'exponential', initialDelay: 500 } },
    circuitBreaker: {
      halfOpenAfter: 30_000,
      breaker: { type: 'consecutive', threshold: 5 },
    },
    timeout: { duration: 5_000 },
  },
  smsProvider: {
    timeout: { duration: 2_000 },
    bulkhead: { limit: 10, queue: 5 },
  },
});

const charge = await externalPolicies.execute('paymentGateway', async ({ signal }) => {
  return stripe.charges.create(chargeParams, { signal });
});
```

Όλοι οι handlers μοιράζονται την ίδια κατάσταση circuit breaker για το `'paymentGateway'`, προστατεύοντας τα εξωτερικά APIs από αλυσιδωτές αποτυχίες (cascading failures).

## Ενσωμάτωση NestJS (`@cqrs-ddd/nestjs`)

Καταχωρίστε το `ResiliencePolicies` ως injectable provider:

```typescript
import { Module, Global } from '@nestjs/common';
import { ResiliencePolicies } from '@cqrs-ddd/pipeline-resilience';

@Global()
@Module({
  providers: [
    {
      provide: ResiliencePolicies,
      useFactory: () =>
        new ResiliencePolicies({
          stripeApi: {
            handle: (error) => isTransientHttpError(error),
            retry: { maxAttempts: 3 },
            circuitBreaker: { halfOpenAfter: 15_000, breaker: { type: 'consecutive', threshold: 3 } },
            timeout: { duration: 4_000 },
          },
        }),
    },
  ],
  exports: [ResiliencePolicies],
})
export class ResilienceModule {}
```

Διακοσμήστε handlers με `resilience()`:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { resilience } from '@cqrs-ddd/pipeline-resilience';

@CommandHandler(SyncInventoryCommand)
@UsePipeline(
  resilience({
    retry: { maxAttempts: 3, replaySafe: true },
    timeout: { duration: 10_000, strategy: 'cooperative' },
    handle: (err) => err instanceof DatabaseDeadlockError,
  }),
)
export class SyncInventoryHandler implements ICommandHandler<SyncInventoryCommand> {
  async execute(command: SyncInventoryCommand) {}
}
```

## Σειρά των επιπέδων (Layer Ordering)

Το `ResilienceBehavior` συνθέτει τις πολιτικές με την ακόλουθη προεπιλεγμένη σειρά (από το εξωτερικό προς το εσωτερικό):

```text
['retry', 'bulkhead', 'timeout']
```

Μπορείτε να προσαρμόσετε τη σειρά μέσω της επιλογής `order`:

```typescript
resilience({
  order: ['bulkhead', 'retry', 'timeout'],
  retry: { maxAttempts: 3 },
  bulkhead: { limit: 10 },
  timeout: { duration: 2_000 },
})
```

## Τύποι σφαλμάτων & Guards

Επανεξάγει τις κλάσεις σφαλμάτων του Cockatiel και αντίστοιχα guards:
- `BrokenCircuitError` / `isBrokenCircuitError(err)`: Ρίχνεται όταν μια κλήση μπλοκάρεται από ανοιχτό circuit breaker.
- `BulkheadRejectedError` / `isBulkheadRejectedError(err)`: Ρίχνεται όταν τα όρια ταυτόχρονης εκτέλεσης και η ουρά εξαντληθούν.
- `TaskCancelledError` / `isTaskCancelledError(err)`: Ρίχνεται όταν η εκτέλεση υπερβεί το timeout.

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-resilience/)
