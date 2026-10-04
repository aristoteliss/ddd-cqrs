---
title: "@cqrs-ddd/pipeline"
description: "Η μηχανή του pipeline: createPipeline(), pipeline.wrap(), το logging behavior, pipeline items και πηγές context."
sidebar:
  order: 1
---

Η κεντρική μηχανή της οικογένειας pipeline. Το `createPipeline()` ρυθμίζει τα behaviors μία φορά,
ενώ το `pipeline.wrap()` τα εκτελεί γύρω από μια απλή συνάρτηση ή μέθοδο κλάσης. Δεν απαιτεί
κανένα framework, κανένα dependency-injection container και καμία υποδομή CQRS. Παρέχει επίσης
το `LoggingBehavior`, τα contracts που δηλώνουν τα behaviors, typed pipeline items και τις
πηγές context για tenant και correlation id.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/pipeline
```

Απαιτεί Node.js 22.12 ή νεότερο, ή άλλο runtime με υποστήριξη `AsyncLocalStorage` (Bun, Deno).

## Χρήση

```ts
import { createPipeline, LoggingBehavior, logging } from '@cqrs-ddd/pipeline';

export const pipeline = createPipeline({
  behaviors: [new LoggingBehavior(console)],
  globalBehaviors: { before: [logging({ requestResponseLogLevel: 'log' })] },
});

export const getPrice = pipeline.wrap({ name: 'getPrice', kind: 'query' })(
  async (sku: string) => prices.find(sku),
);

class Prices {
  @pipeline.wrap({ kind: 'query' })
  async find(sku: string) {}
}
```

## Επιλογές createPipeline

| Επιλογή | Σημασία | Προεπιλογή |
| --- | --- | --- |
| `behaviors` | instances behaviors, ένα ανά κλάση. Ένα δηλωμένο behavior χωρίς instance δημιουργείται χωρίς ορίσματα | κανένα |
| `globalBehaviors` | behaviors γύρω από κάθε λειτουργία: `{ scope, before, after }` ή πίνακας αυτών | κανένα |
| `sources` | από πού αντλούν οι εκτελέσεις το tenant και το correlation id τους | κανένα |
| `diagnostics` | τι συμβαίνει σε παραβίαση contract: `'strict'` ρίχνει σφάλμα, `'warn'` καταγράφει log, `'off'` αγνοεί | `'strict'` |
| `logger` | δέχεται τα `'warn'` diagnostics | `console` |

Τα global behaviors κατασκευάζονται κατά τη δημιουργία του pipeline, επομένως μια ελλείπουσα εξάρτηση
αποτυγχάνει εκεί. Δύο instances της ίδιας κλάσης behavior απορρίπτονται.

## pipeline.wrap

Το `pipeline.wrap(options, ...entries)` ή `pipeline.wrap(...entries)` επιστρέφει έναν wrapper για
συνάρτηση ή μέθοδο, τόσο στο standard mode όσο και στο `experimentalDecorators` mode. Οι επιλογές
είναι `name`, `kind` (`'command'`, `'query'` ή `'event'`) και `skip` (global behaviors προς εξαίρεση).
Δείτε [Πώς γίνεται wrap μια λειτουργία](/ddd-cqrs/el/concepts/wrapping/) για το πώς εξάγονται το όνομα,
το είδος και το request, και [Σειρά εκτέλεσης](/ddd-cqrs/el/concepts/execution-order/) για τη σειρά
των behaviors.

Το `REQUEST_KIND` είναι το symbol μέσω του οποίου ένα αίτημα δηλώνει το δικό του είδος. Τα αιτήματα
του `@cqrs-ddd/core` το φέρουν.

## Logging

Το `LoggingBehavior` καταγράφει μία γραμμή ανά εκτέλεση με το correlation id, είδος, ονόματα και
διάρκεια, και προαιρετικά το request και το response. Το `logging(options)` κατασκευάζει το entry του.
Γράφει μέσω του logger που δίνεται στον constructor του, ή στο `console`.

| Επιλογή | Σημασία | Προεπιλογή |
| --- | --- | --- |
| `metricLogLevel` | επίπεδο της γραμμής που γράφεται μετά από επιτυχία | `'log'` |
| `errorLogLevel` | επίπεδο της γραμμής που γράφεται όταν η κλήση αποτυγχάνει | `'error'` |
| `mapLogLevel` | επίπεδο ανά κλάση σφάλματος, με την πιο ειδική κλάση να υπερισχύει | κανένα |
| `requestResponseLogLevel` | επίπεδο των γραμμών request και response | `'debug'` |
| `excludeRequestObj`, `excludeResponseObj` | παράλειψη των payloads από αυτές τις γραμμές | `true` |
| `excludeKeys` | κλειδιά ή dot paths που αφαιρούνται από τα καταγεγραμμένα payloads | `[]` |
| `redactKeys` | κλειδιά ή dot paths που καλύπτονται ως `[REDACTED]` | `[]` |
| `redactSensitiveKeys` | απόκρυψη γνωστών ευαίσθητων στοιχείων όπως κωδικοί και tokens | `true` |
| `logFormat` | γραμμές `'text'` ή δομημένα αντικείμενα `'structured'` | `'text'` |

Κάθε επίπεδο είναι ένα `LogLevel` (`'log'`, `'error'`, `'warn'`, `'debug'`, `'verbose'`,
`'fatal'`) ή `'none'`.

## Items και το request

- Τα `createPipelineItem`, `getPipelineItem`, `setPipelineItem`, `requirePipelineItem` και
  `hasPipelineItem` μοιράζονται typed τιμές μεταξύ behaviors μέσω του `context.items`.
  Το `requirePipelineItem` ρίχνει `MissingPipelineItemError` αν η τιμή λείπει.
- Το `replaceRequest(context, value)` παραδίδει στη συνάρτηση ένα νέο input, όπως ένα parsed αντίγραφο.

Δείτε [Το pipeline context](/ddd-cqrs/el/concepts/context/).

## Contracts και ταυτότητα

Μια κλάση behavior μπορεί να δηλώσει contract στο `PIPELINE_BEHAVIOR_CONTRACT` (κανόνες σειράς
και ελέγχους επιλογών) και σταθερή ταυτότητα στο `PIPELINE_BEHAVIOR_ID`. Ένα παραβιασμένο contract
ρίχνει `PipelineConfigurationError` σε `'strict'` mode. Δείτε
[Προσαρμοσμένα behaviors](/ddd-cqrs/el/guides/custom-behaviors/).

## Κλειδιά διαχωρισμένα ανά tenant (Partitioned keys)

Το `tenantSegments()` δημιουργεί το τμήμα tenant ενός κλειδιού, και το `MissingPartitionError`
είναι η βασική κλάση των σφαλμάτων που ρίχνουν τα keyed behaviors όταν λείπει το απαιτούμενο tenant
ή principal. Τα πακέτα cache, idempotency και rate-limit βασίζονται σε αυτά.

## Κλάσεις handlers

Το `@UsePipeline(...entries)` δηλώνει τα behaviors μιας κλάσης handler, από το εξωτερικό προς το
εσωτερικό, και το `@SkipPipeline(...Behaviors)` εξαιρεί global behaviors. Και τα δύο λειτουργούν
στο standard mode και στο `experimentalDecorators` mode. Ένα runtime διαβάζει τη δήλωση με
το `pipelineOf(Handler)`: το [`@cqrs-ddd/cqrs`](/ddd-cqrs/el/packages/cqrs/) το χρησιμοποιεί,
όπως και ένας framework adapter.

```ts
import { LoggingBehavior, SkipPipeline, UsePipeline } from '@cqrs-ddd/pipeline';
import { audit } from '@cqrs-ddd/pipeline-audit';

@UsePipeline(audit({ action: 'user.create' }))
@SkipPipeline(LoggingBehavior)
class CreateUserHandler {}
```

## Χαμηλότερου επιπέδου API (Lower-level API)

Τα `compilePipelinePlan()`, `createPipelineRunner()`, `validateBehaviorContracts()` και
`pipelineStore` είναι τα θεμέλια πάνω στα οποία δομείται το `createPipeline()`. Ένας framework
adapter τα χρησιμοποιεί, μαζί με το `pipelineOf()`, για να εκτελεί τα ίδια behaviors γύρω από
τους δικούς του handlers.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline/)
