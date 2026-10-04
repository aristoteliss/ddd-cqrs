---
title: "@cqrs-ddd/pipeline-correlation"
description: "Διάδοση correlation id μέσω HTTP αιτημάτων, καταναλωτών μηνυμάτων (consumers) και background jobs, καθώς και στα pipelines."
sidebar:
  order: 31
---

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

## Το HTTP middleware

| Επιλογή | Σημασία | Προεπιλογή |
| --- | --- | --- |
| `header` | η επικεφαλίδα ανάγνωσης (μη έγκυρο όνομα ρίχνει σφάλμα κατά την κατασκευή) | `'x-correlation-id'` |
| `acceptIncoming` | αποδοχή id που στάλθηκε από τον client | `true` |
| `trimIncoming` | αφαίρεση κενών γύρω από το εισερχόμενο id | `false` |
| `maxLength` | μέγιστο αποδεκτό μήκος εισερχόμενου id | `128` |
| `validateIncoming` | predicate που πρέπει να περάσει το εισερχόμενο id | χαρακτήρες του `DEFAULT_CORRELATION_ID_PATTERN` |

Ένα εισερχόμενο id που αποτυγχάνει σε αυτούς τους ελέγχους αντικαθίσταται από ένα νέο.

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

Το `addCorrelationId(data)` επιστρέφει αντίγραφο απλού αντικειμένου με προστεθειμένο το `correlationId`. Το `runWithCorrelationId(id, fn)` εκτελεί τη `fn` εντός αυτού του id.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-correlation/)
