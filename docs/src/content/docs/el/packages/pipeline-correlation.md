---
title: "@cqrs-ddd/pipeline-correlation"
description: "Διάδοση correlation id μέσω HTTP αιτημάτων, καταναλωτών μηνυμάτων (consumers) και background jobs, καθώς και στα pipelines."
sidebar:
  order: 31
---
[![npm version](https://img.shields.io/npm/v/@cqrs-ddd/pipeline-correlation.svg)](https://www.npmjs.com/package/@cqrs-ddd/pipeline-correlation)
[![npm downloads](https://img.shields.io/npm/dm/@cqrs-ddd/pipeline-correlation.svg)](https://www.npmjs.com/package/@cqrs-ddd/pipeline-correlation)
[![Node.js](https://img.shields.io/node/v/@cqrs-ddd/pipeline-correlation.svg)](https://www.npmjs.com/package/@cqrs-ddd/pipeline-correlation)
[![License](https://img.shields.io/badge/license-AGPL--3.0%20%7C%20commercial-blue.svg)](https://github.com/aristoteliss/ddd-cqrs#license-and-commercial-use)

Διαδίδει ένα correlation id —το μοναδικό αναγνωριστικό που συνδέει μια εργασία με το αίτημα ή το μήνυμα που την προκάλεσε— σε ολόκληρη την εφαρμογή Node.js:

- Το `httpCorrelation()` το λαμβάνει από μια εισερχόμενη HTTP επικεφαλίδα ή παράγει ένα νέο.
- Το `@WithCorrelation()` το λαμβάνει από ένα job ουράς, ένα μήνυμα ή μια ειδοποίηση στη μέθοδο του consumer, και στα δύο TypeScript decorator modes.
- Το `correlationSource` το παρέχει στα pipelines, ενώ τα `correlationHeaders()` και `addCorrelationId()` το μεταφέρουν σε εξερχόμενα αιτήματα και μηνύματα.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/pipeline-correlation
```

## Χρήση

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  correlationSource,
  getCorrelationId,
  httpCorrelation,
} from '@cqrs-ddd/pipeline-correlation';

const pipeline = createPipeline({ sources: { correlationId: correlationSource } });

app.use(httpCorrelation());
app.get('/ping', (_req, res) => res.send(getCorrelationId()));
```

Το middleware που επιστρέφει το `httpCorrelation()`, `(req, res, next)`, ταιριάζει στον HTTP server του Node, στο Express και στο Connect.

### Ενσωμάτωση NestJS (`@cqrs-ddd/nestjs`)

Για εφαρμογές NestJS, εισάγετε το `CorrelationMiddleware` από το `@cqrs-ddd/nestjs/correlation` και καταχωρίστε το στο `AppModule`:

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { CorrelationMiddleware } from '@cqrs-ddd/nestjs/correlation';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
```

Το middleware εφαρμόζει τους κανόνες που ορίζει το `configureCorrelation()`· δείτε την ενότητα «Κανόνες για εισερχόμενα ids».

## Το HTTP middleware

| Επιλογή | Σημασία | Προεπιλογή |
| --- | --- | --- |
| `header` | η επικεφαλίδα ανάγνωσης (μη έγκυρο όνομα ρίχνει σφάλμα κατά την κατασκευή) | `'x-correlation-id'` |
| `acceptIncoming` | αποδοχή id που στάλθηκε από τον client | `true` |
| `trimIncoming` | αφαίρεση κενών γύρω από το εισερχόμενο id | `false` |
| `maxLength` | μέγιστο αποδεκτό μήκος εισερχόμενου id | το `maxLength` του `configureCorrelation()`, προεπιλογή `128` |
| `validateIncoming` | predicate που πρέπει να περάσει το εισερχόμενο id | το `validateIncoming` του `configureCorrelation()`, προεπιλογή οι χαρακτήρες του `DEFAULT_CORRELATION_ID_PATTERN` |

Ένα εισερχόμενο id που αποτυγχάνει σε αυτούς τους ελέγχους αντικαθίσταται από ένα νέο και αναφέρεται στο `onRejected` με πηγή (source) `'http'`.

## Κανόνες για εισερχόμενα ids

Από την έκδοση 0.5.2, κάθε σημείο εισόδου ελέγχει το id που λαμβάνει: τα `httpCorrelation()`, `runWithCorrelationId()`, `@WithCorrelation()` και `correlationSource.accepts()`, το οποίο χρησιμοποιούν τα job contexts. Ένα id περνά όταν:

1. είναι εκτυπώσιμοι χαρακτήρες ASCII (0x20 έως 0x7E) και ούτε αρχίζει ούτε τελειώνει με κενό. Τίποτα δεν απενεργοποιεί αυτόν τον έλεγχο: οποιοδήποτε άλλο id αλλάζει μεταξύ υπηρεσιών (τα HTTP και gRPC αφαιρούν τα κενά στα άκρα, τα text metadata του gRPC απορρίπτουν χαρακτήρες εκτός ASCII) ή μεταφέρει χαρακτήρες ελέγχου στα logs και στα headers·
2. έχει το πολύ `maxLength` χαρακτήρες, προεπιλογή 128·
3. το `validateIncoming` το αποδέχεται· από προεπιλογή ταιριάζει με το `DEFAULT_CORRELATION_ID_PATTERN`.

Μέχρι να κληθεί το `configureCorrelation()`, τα `runWithCorrelationId()` και `@WithCorrelation()` εφαρμόζουν μόνο τον πρώτο έλεγχο, και τα `httpCorrelation()` και `accepts()` εφαρμόζουν και τους τρεις με τις προεπιλογές τους, όπως πριν από την 0.5.2. Μόλις κληθεί, ακόμη και ως `configureCorrelation({})`, κάθε σημείο εισόδου εφαρμόζει και τους τρεις.

Ένα id που απορρίπτεται αντικαθίσταται από το τρέχον id ή από νέο, και η εργασία συνεχίζεται· ένα id που λείπει ή είναι κενό αντικαθίσταται με τον ίδιο τρόπο. Ορίστε τους κανόνες μία φορά, κατά την εκκίνηση:

```ts
import { configureCorrelation } from '@cqrs-ddd/pipeline-correlation';

configureCorrelation({
  validateIncoming: (id) => /^[0-9a-f-]{36}$/i.test(id),
  onRejected: ({ reason, source, length }) =>
    logger.warn({ reason, source, length }, 'correlation id replaced'),
});
```

| Πεδίο | Σημασία | Προεπιλογή |
| --- | --- | --- |
| `maxLength` | μέγιστο αποδεκτό μήκος εισερχόμενου id· θετικός ασφαλής ακέραιος, αλλιώς η κλήση ρίχνει σφάλμα | `128` |
| `validateIncoming` | ο κανόνας της εφαρμογής· επιστροφή `false` ή σφάλμα απορρίπτει το id | χαρακτήρες του `DEFAULT_CORRELATION_ID_PATTERN` |
| `onRejected` | καλείται με `{ reason, source, length }` για κάθε id που αντικαθίσταται | κανένα |

Το `reason` είναι `'not-string'`, `'too-long'`, `'invalid-character'`, `'surrounding-space'` ή `'rule'`. Το `source` είναι `'http'`, `'runWithCorrelationId'` ή `'Class.method'` για μια μέθοδο με `@WithCorrelation()`. Η αναφορά παραλείπει το ίδιο το id, ώστε μια πλαστή τιμή να μη φτάνει ποτέ σε log μέσω αυτής. Ένα id που λείπει ή είναι κενό δεν αναφέρεται, το `correlationSource.accepts()` δεν αναφέρει τίποτα, και ένα σφάλμα που ρίχνει το `onRejected` αγνοείται.

Κάθε κλήση αντικαθιστά όλους τους κανόνες, και το `configureCorrelation()` χωρίς πολιτική επαναφέρει την κατάσταση πριν από την πρώτη κλήση. Το `validateIncoming` πρέπει να αποδέχεται τα UUIDv7 ids που φτιάχνει το `correlationSource.create()`: τα jobs που βάζει στην ουρά ένα αίτημα φέρουν το id του αιτήματος, και ένα job του οποίου το context έχει id που το `accepts()` απορρίπτει αποτυγχάνει. Οι επιλογές `maxLength` και `validateIncoming` του `httpCorrelation()` αντικαθιστούν αυτούς τους κανόνες μόνο για εκείνο το middleware. Μια εφαρμογή που εμφανίζει ένα correlation id σε HTML εξακολουθεί να το κάνει escape.

## Καταναλωτές (Consumers)

Το `@WithCorrelation()` εκτελεί τη διακοσμημένη μέθοδο με το correlation id του μηνύματος που λαμβάνει:

```ts
import { WithCorrelation } from '@cqrs-ddd/pipeline-correlation';

class WelcomeWorker {
  @WithCorrelation() // διαβάζει job.data.correlationId
  async process(job: { data: { correlationId?: string; userId: string } }) {}

  @WithCorrelation({ path: 'correlationId' })
  async onNotification(notification: { correlationId?: string }) {}
}
```

| Επιλογή | Σημασία | Προεπιλογή |
| --- | --- | --- |
| `path` | dot path στο πρώτο όρισμα | `'data.correlationId'` |
| `extract` | συνάρτηση των ορισμάτων της μεθόδου που επιστρέφει το id | κανένα |
| `logLevel` | επίπεδο της γραμμής log κατά την εκκίνηση, ή `'none'` | `'debug'` |

Το `CorrelationFrom.grpc(key)` είναι προκαθορισμένο `extract` για gRPC handlers (διαβάζει κλειδί από τα metadata της κλήσης). Για μηνύματα με id σε headers ή properties:

```ts
class Consumers {
  // RabbitMQ (amqplib)
  @WithCorrelation({ extract: (message) => message.properties.correlationId })
  async onUserCreated(message: ConsumeMessage) {}

  // Kafka (kafkajs)
  @WithCorrelation({
    extract: ({ message }) => message.headers?.['x-correlation-id']?.toString(),
  })
  async onOrderPlaced(payload: EachMessagePayload) {}
}
```

## Εξερχόμενη εργασία (Outgoing work)

```ts
await fetch(url, { headers: { ...correlationHeaders() } });
await queue.add('welcome', addCorrelationId({ userId }));
await runWithCorrelationId(job.correlationId, () => processBatch(job));
```

Το `addCorrelationId(data)` επιστρέφει αντίγραφο απλού αντικειμένου με προστεθειμένο το `correlationId`. Το `runWithCorrelationId(id, fn)` εκτελεί τη `fn` εντός αυτού του id όταν οι κανόνες το αποδέχονται, και αλλιώς εντός του τρέχοντος id ή ενός νέου.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-correlation/)
