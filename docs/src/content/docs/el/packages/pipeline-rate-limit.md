---
title: "@cqrs-ddd/pipeline-rate-limit"
description: "Rate limits για διακοσμημένες συναρτήσεις και μεθόδους σε οποιονδήποτε limiter με μέθοδο consume(), με κλειδιά διαχωρισμένα ανά tenant και caller."
sidebar:
  order: 14
---

Επιβάλλει πολιτικές περιορισμού ρυθμού (rate limiting) και quotas σε κατανεμημένα microservices. Συνεργάζεται με οποιονδήποτε limiter διαθέτει μέθοδο `consume()`, συμπεριλαμβανομένου του [rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible) (Redis, Memory, PostgreSQL, MySQL).

Αιτήματα που υπερβαίνουν το quota απορρίπτονται πριν εκτελεστεί η επιχειρησιακή λογική, ρίχνοντας `RateLimitExceededError` το οποίο μεταφράζεται σε HTTP 429 Too Many Requests με υπολογισμένη επικεφαλίδα `Retry-After`.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/pipeline-rate-limit @cqrs-ddd/pipeline rate-limiter-flexible
```

Συμβατό με όλους τους adapters του `rate-limiter-flexible` (`RateLimiterRedis`, `RateLimiterMemory`, `RateLimiterPostgres`, `RateLimiterCluster`).

## Μοτίβα χρήσης

### 1. Plain Node.js / Μηχανή Pipeline

```typescript
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  createPartitionedRateLimitKeyFactory,
  RateLimitBehavior,
  rateLimit,
} from '@cqrs-ddd/pipeline-rate-limit';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const limiter = new RateLimiterRedis({
  storeClient: redis,
  points: 100,      // 100 πόντοι
  duration: 60,     // ανά 60 δευτερόλεπτα
  keyPrefix: 'rl',
});

const pipeline = createPipeline({
  behaviors: [new RateLimitBehavior(limiter)],
});

const perUserKey = createPartitionedRateLimitKeyFactory(
  (ctx) => ctx.items.get('userId') as string,
  { onMissingPartition: 'throw', includeTenant: true },
);

export const searchCatalog = pipeline.wrap(
  { name: 'searchCatalog', kind: 'query' },
  rateLimit({ keyFactory: perUserKey, points: 1 }),
)(async (term: string) => catalog.search(term));
```

### 2. Ενσωμάτωση NestJS (`@cqrs-ddd/nestjs`)

Καταχωρίστε το `RateLimitBehavior` σε ένα rate-limiting ή security module:

```typescript
import { Module } from '@nestjs/common';
import { RateLimitBehavior } from '@cqrs-ddd/pipeline-rate-limit';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { RedisService } from '../redis/redis.service.js';

@Module({
  providers: [
    {
      provide: RateLimitBehavior,
      inject: [RedisService],
      useFactory: (redis: RedisService) => {
        const limiter = new RateLimiterRedis({
          storeClient: redis.client,
          points: 50,
          duration: 60,
        });
        return new RateLimitBehavior(limiter);
      },
    },
  ],
  exports: [RateLimitBehavior],
})
export class RateLimitModule {}
```

Διακοσμήστε handlers:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { rateLimit } from '@cqrs-ddd/pipeline-rate-limit';

@CommandHandler(SendVerificationCodeCommand)
@UsePipeline(rateLimit({ keyFactory: verificationKeyFactory, points: 5 }))
export class SendVerificationCodeHandler implements ICommandHandler<SendVerificationCodeCommand> {
  async execute(command: SendVerificationCodeCommand) {}
}
```

Το `ErrorFilter` αντιστοιχίζει αυτόματα το `RateLimitExceededError` σε HTTP 429 Too Many Requests και θέτει την επικεφαλίδα `Retry-After: <seconds>`.

## Δυναμική κατανάλωση πόντων

Αιτήματα μπορούν να καταναλώνουν διαφορετικό κόστος πόντων ανάλογα με το βάρος εκτέλεσης (π.χ. batch ενέργειες):

```typescript
@UsePipeline(
  rateLimit({
    keyFactory: perUserKey,
    points: (ctx) => {
      const command = ctx.request as BatchImportCommand;
      return Math.max(1, command.items.length);
    },
  }),
)
export class BatchImportHandler {}
```

## Διαχωρισμός κλειδιών (Partitioned Keys)

Το `createPartitionedRateLimitKeyFactory(partitionFn, options)` κατασκευάζει κλειδιά στη μορφή `<tenant>:<partition>:<requestName>`:

| Επιλογή | Τύπος | Προεπιλογή | Περιγραφή |
| --- | --- | --- | --- |
| `onMissingPartition` | `'throw' \| 'request'` | `'throw'` | Με `'throw'`, αιτήματα χωρίς ταυτοποιημένο καλούντα αποτυγχάνουν με `MissingRateLimitPartitionError`. Με `'request'`, μοιράζονται ένα bucket ανά αίτημα και tenant. |
| `includeTenant` | `boolean` | `true` | Προσαρτά το ενεργό tenant ID για αποφυγή διεκδίκησης quota μεταξύ tenants. |
| `requireTenant` | `boolean` | `includeTenant` | Ρίχνει `MissingRateLimitPartitionError` αν λείπει το tenant. |

Παραδείγματα:
- Αυθεντικοποιημένος χρήστης: `org_123:usr_456:searchCatalog`
- Διεύθυνση IP: `org_123:ip_192.168.1.1:searchCatalog`

## Επιλογές παραμετροποίησης

| Επιλογή | Τύπος | Προεπιλογή | Περιγραφή |
| --- | --- | --- | --- |
| `keyFactory` | `RateLimitKeyFactory` | υποχρεωτικό | Συνάρτηση παραγωγής του partition string. |
| `points` | `number \| ((ctx) => number)` | `1` | Κόστος πόντων για το αίτημα (ακέραιος $\ge 0$). Το `0` δεν καλεί τον limiter. |
| `keyPrefix` | `string` | `undefined` | Πρόσθετο πρόθεμα στο παραγόμενο κλειδί. |
| `limiter` | `RateLimiterLike` | limiter του constructor | Παράκαμψη του προεπιλεγμένου limiter για τη συγκεκριμένη λειτουργία. |
| `failOpen` | `boolean` | `true` | Με `true`, σφάλματα του backend (π.χ. Redis offline) καταγράφουν log και επιτρέπουν την εκτέλεση. Με `false`, απορρίπτουν. |

## Παρατηρησιμότητα

Το `RateLimitBehavior` καταγράφει στοιχεία στο `context.items`:
- `RATE_LIMIT_ITEM_TOKEN`: το αποτέλεσμα του limiter με τους υπολειπόμενους πόντους και τα milliseconds μέχρι τον επόμενο πόντο.
- `buildRateLimitAttributes(context)`: `{ 'rate_limit.remaining_points': n }`.

## Μετατροπή σε HTTP απάντηση

Όταν εξαντληθούν οι πόντοι, ρίχνεται `RateLimitExceededError`:

```typescript
import { RateLimitExceededError } from '@cqrs-ddd/pipeline-rate-limit';
import { toHttpResponse } from '@cqrs-ddd/pipeline-rate-limit/http';

try {
  await searchCatalog(term);
} catch (error) {
  if (!(error instanceof RateLimitExceededError)) throw error;
  const { status, body, headers } = toHttpResponse(error);
  // status: 429
  // body: { statusCode: 429, error: 'Too Many Requests', message, retryAfter: 12 }
  // headers: { 'Retry-After': '12' }
}
```

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-rate-limit/)
