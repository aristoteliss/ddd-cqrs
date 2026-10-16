---
title: Επισκόπηση
description: Τι είναι τα πακέτα @cqrs-ddd και πώς συνδυάζονται.
---

Τα πακέτα `@cqrs-ddd` είναι δομικά στοιχεία TypeScript που λειτουργούν χωρίς δέσμευση σε framework. Χωρίζονται σε δύο ανεξάρτητες βασικές οικογένειες (το pipeline και τα στοιχεία DDD) και συμπληρώνονται από δύο runtimes εφαρμογής: το `@cqrs-ddd/cqrs`, χωρίς framework, και το `@cqrs-ddd/nestjs`, τον adapter αυτού του έργου για NestJS.

Το αποθετήριο ονομάζεται `ddd-cqrs`· κάθε πακέτο εγκαθίσταται από το npm scope `@cqrs-ddd/*`.

## Η οικογένεια του pipeline

Το [`@cqrs-ddd/pipeline`](/ddd-cqrs/packages/pipeline/) είναι η κεντρική μηχανή εκτέλεσης: το `createPipeline()` ρυθμίζει τα behaviors μία φορά και το `pipeline.wrap()` τα εκτελεί γύρω από μια απλή συνάρτηση ή μια μέθοδο κλάσης. Ένα behavior είναι ένα αντικείμενο με μία μέθοδο, την `handle(context, next)`, ώστε να δρα πριν από την κλήση, μετά από αυτήν ή στη θέση της.

Κάθε πακέτο `@cqrs-ddd/pipeline-<name>` προσφέρει μία συγκεκριμένη λειτουργία ως behavior:

| Λειτουργία | Πακέτο |
| --- | --- |
| Logging | [`@cqrs-ddd/pipeline`](/ddd-cqrs/packages/pipeline/) (`LoggingBehavior`, `logging()`) |
| Επικύρωση | [`@cqrs-ddd/pipeline-zod`](/ddd-cqrs/packages/pipeline-zod/) |
| Εξουσιοδότηση | [`@cqrs-ddd/pipeline-casl`](/ddd-cqrs/packages/pipeline-casl/) |
| Caching | [`@cqrs-ddd/pipeline-cache`](/ddd-cqrs/packages/pipeline-cache/) |
| Idempotency | [`@cqrs-ddd/pipeline-idempotency`](/ddd-cqrs/packages/pipeline-idempotency/) |
| Όρια ρυθμού (rate limits) | [`@cqrs-ddd/pipeline-rate-limit`](/ddd-cqrs/packages/pipeline-rate-limit/) |
| Επανάληψη, timeout, bulkhead | [`@cqrs-ddd/pipeline-resilience`](/ddd-cqrs/packages/pipeline-resilience/) |
| Feature flags | [`@cqrs-ddd/pipeline-feature-flags`](/ddd-cqrs/packages/pipeline-feature-flags/) |
| Ίχνος ελέγχου (audit trail) | [`@cqrs-ddd/pipeline-audit`](/ddd-cqrs/packages/pipeline-audit/) |
| Dead letters | [`@cqrs-ddd/pipeline-deadletter`](/ddd-cqrs/packages/pipeline-deadletter/) |
| Traces και metrics | [`@cqrs-ddd/pipeline-opentelemetry`](/ddd-cqrs/packages/pipeline-opentelemetry/) |
| Tenant, correlation id, context εργασιών | [`@cqrs-ddd/pipeline-tenant`](/ddd-cqrs/packages/pipeline-tenant/), [`@cqrs-ddd/pipeline-correlation`](/ddd-cqrs/packages/pipeline-correlation/), [`@cqrs-ddd/pipeline-job-context`](/ddd-cqrs/packages/pipeline-job-context/) |

Ένα behavior είναι μια απλή κλάση: ο constructor του δέχεται όσες εξαρτήσεις χρειάζεται (ένα cache, ένα store, έναν client) χωρίς κανένα dependency-injection container. Τα behaviors που μετατρέπουν σφάλματα σε απαντήσεις HTTP εξάγουν το `toHttpResponse(error)` από ξεχωριστό entry point `/http`, που λειτουργεί με οποιοδήποτε HTTP framework.

## Η οικογένεια DDD

Το [`@cqrs-ddd/core`](/ddd-cqrs/packages/core/) προσφέρει aggregate roots, domain events, βασικές κλάσεις για commands και queries, συμβόλαια repositories και ένα revision-fenced cache για repositories· το [`@cqrs-ddd/mikro-orm`](/ddd-cqrs/packages/mikro-orm/) προσαρμόζει τα repositories του στο MikroORM.

Τα [`@cqrs-ddd/safe-stringify`](/ddd-cqrs/packages/safe-stringify/), [`@cqrs-ddd/untyped`](/ddd-cqrs/packages/untyped/) και [`@cqrs-ddd/uuidv7`](/ddd-cqrs/packages/uuidv7/) είναι μικρά βοηθητικά πακέτα χωρίς εξαρτήσεις, κοινά και στις δύο οικογένειες.

## Runtimes εφαρμογής

Ανάλογα με την αρχιτεκτονική σας, δύο runtimes εκτελούν τους handlers μέσα από pipelines:

### 1. CQRS χωρίς framework (`@cqrs-ddd/cqrs`)

Το [`@cqrs-ddd/cqrs`](/ddd-cqrs/el/packages/cqrs/) εκτελεί commands, queries και events χωρίς framework:
- Χρησιμοποιεί τα `@CommandHandler`, `@QueryHandler` και `@EventsHandler` στις κλάσεις των handlers.
- Δηλώνει behaviors με τα `@UsePipeline` και `@SkipPipeline` του `@cqrs-ddd/pipeline`.
- Το `createCqrs()` δημιουργεί τα `CommandBus`, `QueryBus`, `EventBus` και `UnhandledExceptionBus`.
- Χωρίς DI container: η εφαρμογή κατασκευάζει τους handlers με `new` και τους καταχωρεί. Δείτε το [CQRS χωρίς NestJS](/ddd-cqrs/el/guides/cqrs/). Το `api/` του αποθετηρίου είναι μια πλήρης εφαρμογή φτιαγμένη με αυτόν τον τρόπο.

### 2. Adapter για NestJS (`@cqrs-ddd/nestjs`)

Το [`@cqrs-ddd/nestjs`](/ddd-cqrs/el/packages/nestjs/) ενσωματώνει τα πακέτα σε μια υπάρχουσα εφαρμογή NestJS:
- Κρατά τους επίσημους handlers και τα buses του `@nestjs/cqrs`, καθώς και το dependency injection του NestJS.
- Το `PipelineModule.forRoot()` συνθέτει τα behaviors του `@cqrs-ddd/pipeline` γύρω από τους handlers του `@nestjs/cqrs` κατά την εκκίνηση.
- Το `ErrorFilter` μετατρέπει κάθε σφάλμα των `@cqrs-ddd` σε `HttpException` του NestJS, με το τυπικό σώμα JSON απάντησης του Nest.
- Προσφέρει τα `CorrelationMiddleware` και `JobContextModule` για tracing και ουρές εργασιών. Δείτε το [NestJS & @cqrs-ddd](/ddd-cqrs/el/guides/from-nestjs/) και τη [σελίδα του πακέτου `@cqrs-ddd/nestjs`](/ddd-cqrs/el/packages/nestjs/).

## Runtimes

| Runtime | Κατάσταση |
| --- | --- |
| Node.js 22.12 ή νεότερο | Υποστηρίζεται. Κάθε σουίτα δοκιμών εκτελείται σε Node.js. Το `@cqrs-ddd/mikro-orm` χρειάζεται 22.17 ή νεότερο, όπως και το MikroORM. |
| Bun | Ο έλεγχος κυκλοφορίας (release check) φορτώνει κάθε entry point κάθε πακέτου σε Bun. Οι σουίτες δοκιμών δεν εκτελούνται σε αυτό. |
| Deno, Cloudflare Workers, browsers | Δεν έχουν δοκιμαστεί. Το pipeline χρησιμοποιεί το `AsyncLocalStorage` του `node:async_hooks`, και αρκετά πακέτα το `node:crypto`. |

Ένα behavior που επικοινωνεί με μια υπηρεσία χρειάζεται τον client της, τον οποίο εγκαθιστά η εφαρμογή: η σελίδα κάθε πακέτου τον αναφέρει.

## Πώς σχετίζονται με όσα ήδη χρησιμοποιείτε

| Επιλογή | Η ευθύνη της | Πώς σχετίζονται τα πακέτα αυτά |
| --- | --- | --- |
| Απλές συναρτήσεις και δικοί σας wrappers | Η λογική της εφαρμογής, με σύνθεση στο χέρι | Συχνά αρκούν. Μια βιβλιοθήκη αξίζει τη θέση της όταν αφαιρεί πραγματική επανάληψη ή κίνδυνο λάθους στη ρύθμιση. |
| Middleware του Express ή του Fastify | Το αίτημα και η απάντηση HTTP | Κρατήστε το για ό,τι αφορά το HTTP. Ένα pipeline τυλίγει τη λειτουργία, οπότε τα ίδια behaviors εκτελούνται και όταν την καλεί ένας worker ή ένα script. |
| `@nestjs/cqrs` | Commands, queries και events μέσα στο NestJS | Το `@cqrs-ddd/nestjs` εκτελεί pipelines από behaviors γύρω από τους handlers του· τα buses παραμένουν αυτά του NestJS. |
| `@cqrs-ddd/cqrs` | Buses και pipelines handlers χωρίς framework | Έχει τους decorators των handlers και τα ονόματα των buses του `@nestjs/cqrs`, όχι [κάθε δυνατότητα](/ddd-cqrs/el/guides/from-nestjs/#τι-δεν-περιλαμβάνεται). |
| Ένα dependency-injection container | Η κατασκευή και η επίλυση των εξαρτήσεων | Διαφορετική ευθύνη. Τα πακέτα αυτά δεν χρειάζονται container· η εφαρμογή τα συνδέει όπως θέλει. |

## Χρήση μαζί

Καμία από τις δύο οικογένειες δεν εξαρτάται από την άλλη. Ένα `BaseCommand`, `BaseQuery` ή `DomainEvent` του `@cqrs-ddd/core` φέρει το σύμβολο `REQUEST_KIND`, που λέει στα behaviors του pipeline τι είδους αίτημα είναι, ώστε οι handlers με decorators να εκτελούνται χωρίς επιπλέον ρύθμιση: δείτε το [DDD χωρίς framework](/ddd-cqrs/el/guides/ddd/).
