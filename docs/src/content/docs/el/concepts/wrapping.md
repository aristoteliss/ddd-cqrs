---
title: Πώς τυλίγεται μια λειτουργία
description: Το όνομα, το είδος (kind) και το request μιας τυλιγμένης συνάρτησης ή μεθόδου, και πότε ελέγχεται η διαμόρφωσή της.
sidebar:
  order: 1
---

Το `pipeline.wrap(options, ...entries)` προετοιμάζει μία λειτουργία. Επιστρέφει έναν wrapper που εφαρμόζεται σε μια απλή συνάρτηση ή διακοσμεί (decorates) μια μέθοδο· ο ίδιος wrapper λειτουργεί τόσο με τους τυπικούς decorators του TypeScript 5+ όσο και με `experimentalDecorators`.

```typescript
const wrapper = pipeline.wrap({ name: 'getPrice', kind: 'query' }, cache({ key }));

export const getPrice = wrapper(async (sku: string) => prices.find(sku));

class Prices {
  @pipeline.wrap({ kind: 'query' }, cache({ key }))
  async find(sku: string) {}
}
```

Οι ρυθμίσεις είναι προαιρετικές όταν κάθε τιμή μπορεί να παραχθεί αυτόματα· ακολουθούν τα entries, από έξω προς τα μέσα. Η κλήση `pipeline.wrap(cache({ key }))` είναι ισοδύναμη χωρίς ρητές ρυθμίσεις.

## Entries

Ένα entry είναι μια κλάση behavior ή ένα tuple `[Behavior, options]`. Κάθε πακέτο behavior εξάγει έναν helper που κατασκευάζει το αντίστοιχο tuple, όπως `cache({ key })`, `validated(schema)` ή `audit({ action })`. Οι ρυθμίσεις ενός entry ισχύουν μόνο για τη συγκεκριμένη λειτουργία.

## Το όνομα (name)

Το όνομα διαχωρίζει τις λειτουργίες στα κλειδιά cache, στα κλειδιά idempotency, στα αρχεία καταγραφής (logs) και στα traces.

| Τυλιγμένο στοιχείο | Όνομα |
| --- | --- |
| απλή συνάρτηση | η ρύθμιση `name` (απαιτείται) |
| μέθοδος, με `name` | η ρύθμιση `name` |
| μέθοδος, χωρίς `name` | `Class.method`, από το instance στο οποίο καλείται |

Από αυτό προκύπτουν δύο τιμές:
- Το `context.handlerName` είναι το παραπάνω όνομα.
- Το `context.requestName` είναι η ρύθμιση `name` όταν παρέχεται· διαφορετικά είναι το όνομα της κλάσης ενός branded request (δείτε παρακάτω), και σε άλλη περίπτωση το όνομα του handler.

## Το είδος (kind)

Το είδος καθορίζει τι κάνει η λειτουργία:
- `query`: διαβάζει δεδομένα χωρίς αλλαγή κατάστασης.
- `command`: μεταβάλλει την κατάσταση.
- `event`: αντιδρά σε προηγούμενο συμβάν.

Τα behaviors χρησιμοποιούν το kind: το idempotency εφαρμόζεται σε commands από προεπιλογή, το cache σε queries, και ένα global entry μπορεί να περιοριστεί σε συγκεκριμένο είδος.

Το kind προέρχεται από τη ρύθμιση `kind` ή απευθείας από το request. Ένα request του οποίου η κλάση φέρει το σύμβολο `REQUEST_KIND` δηλώνει το δικό του είδος:

```typescript
import { REQUEST_KIND } from '@cqrs-ddd/pipeline';

class GetPriceQuery {
  get [REQUEST_KIND]() {
    return 'query' as const;
  }
  constructor(readonly sku: string) {}
}
```

Οι κλάσεις `BaseCommand`, `BaseQuery` και `DomainEvent` του `@cqrs-ddd/core` το περιλαμβάνουν αυτόματα, επομένως μια μέθοδος που λαμβάνει κάποιο από αυτά δεν χρειάζεται ούτε `name` ούτε `kind`: δείτε [DDD χωρίς framework](/ddd-cqrs/el/guides/ddd/). Το σύμβολο είναι `Symbol.for('@cqrs-ddd/request-kind')`, διατηρώντας τα πακέτα εντελώς ανεξάρτητα. Μια κλήση της οποίας το kind δεν δηλώνεται ούτε ανιχνεύεται αποτυγχάνει με `TypeError`.

## Το αίτημα (request)

Τα behaviors βλέπουν την είσοδο της κλήσης ως `context.request`:
- με ένα όρισμα, το request είναι αυτό το όρισμα·
- με περισσότερα ορίσματα, το request είναι ο πίνακας των ορισμάτων.

Ένα behavior που παράγει μια νέα τιμή (όπως ένα επικυρωμένο αντίγραφο) την παραδίδει στη συνάρτηση με το `replaceRequest(context, value)` αντί να αλλάζει το αρχικό αντικείμενο του καλούντος.

## Παράλειψη καθολικού behavior (skip)

Η επιλογή `skip` παραθέτει καθολικά behaviors από τα οποία εξαιρείται η συγκεκριμένη λειτουργία:

```typescript
pipeline.wrap({ name: 'health', kind: 'query', skip: [LoggingBehavior] })(health);
```

## Πότε ελέγχεται η διαμόρφωση

Τα behaviors μπορούν να δηλώσουν ένα συμβόλαιο (contract): κανόνες σειράς εκτέλεσης έναντι άλλων behaviors και ελέγχους των ρυθμίσεών τους. Το pipeline εκτελεί αυτούς τους ελέγχους μία φορά ανά λειτουργία και είδος, κατά την εφαρμογή του wrapper (κατά τη φόρτωση του module για συναρτήσεις, στον ορισμό της κλάσης για μεθόδους) αν έχει οριστεί η ρύθμιση `kind`, και διαφορετικά στην πρώτη κλήση κάθε είδους.

Η παράμετρος `createPipeline({ diagnostics })` καθορίζει τι συμβαίνει σε περίπτωση παραβίασης:
- `'strict'` (προεπιλογή): εκτοξεύει `PipelineConfigurationError`, αποτυγχάνοντας άμεσα κατά την εκκίνηση (fail-fast).
- `'warn'`: καταγράφει προειδοποίηση μέσω του logger του pipeline.
- `'off'`: αγνοεί τον έλεγχο.
