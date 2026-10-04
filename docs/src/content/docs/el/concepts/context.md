---
title: Το context του pipeline
description: Τι μπορεί να διαβάσει και να γράψει ένα behavior κατά την εκτέλεση, και από πού προέρχονται το tenant και το correlation id.
sidebar:
  order: 3
---

Κάθε κλήση μιας τυλιγμένης λειτουργίας δημιουργεί ένα context, το οποίο λαμβάνει κάθε behavior της αλυσίδας:

| Πεδίο | Τιμή |
| --- | --- |
| `request` | το όρισμα ή ο πίνακας ορισμάτων· δείτε [Πώς τυλίγεται μια λειτουργία](/ddd-cqrs/el/concepts/wrapping/) |
| `requestName`, `handlerName` | τα ονόματα της λειτουργίας |
| `requestKind` | `'command'`, `'query'` ή `'event'` |
| `correlationId` | το αναγνωριστικό που συνδέει αυτή την εκτέλεση με την εργασία που την προκάλεσε |
| `tenantId` | το tenant αυτής της εκτέλεσης, αν υπάρχει |
| `startedAt` | χρονική σήμανση έναρξης της εκτέλεσης |
| `response` | το αποτέλεσμα, αφού επιστρέψει η συνάρτηση |
| `items` | ένας χάρτης (map) που χρησιμοποιούν τα behaviors για να ανταλλάσσουν τιμές μεταξύ τους |
| `getBehaviorOptions(Behavior)` | οι συγχωνευμένες ρυθμίσεις αυτού του behavior για τη συγκεκριμένη λειτουργία |

## Items

Τα behaviors μοιράζονται τιμές μέσω του `context.items`. Ένα τυποποιημένο token διατηρεί το κλειδί μοναδικό και την τιμή ασφαλή ως προς τους τύπους:

```typescript
import {
  createPipelineItem,
  getPipelineItem,
  requirePipelineItem,
  setPipelineItem,
} from '@cqrs-ddd/pipeline';

export const CURRENT_USER = createPipelineItem<string>('currentUser');

// Ένα behavior ταυτοποίησης το ορίζει ...
setPipelineItem(context, CURRENT_USER, userId);

// ... και ένα μεταγενέστερο behavior το διαβάζει.
const userId = getPipelineItem(context, CURRENT_USER);
const required = requirePipelineItem(context, CURRENT_USER);
```

Το `requirePipelineItem` εκτοξεύει `MissingPipelineItemError` όταν η τιμή λείπει. Τα πακέτα behaviors εξάγουν τα δικά τους tokens, όπως το κλειδί cache ή την απόφαση idempotency, ώστε ένα επόμενο behavior να μπορεί να διαβάσει τι αποφάσισε ένα προηγούμενο.

## Tenant και correlation id

Το `createPipeline({ sources })` καθορίζει από πού λαμβάνει μια εκτέλεση το tenant και το correlation id της:

```typescript
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

const pipeline = createPipeline({
  sources: { tenantId: tenantSource, correlationId: correlationSource },
});
```

Όταν ξεκινά μια εκτέλεση:

- το tenant είναι η τρέχουσα τιμή του source· χωρίς source, λαμβάνει το tenant του περιβάλλοντος pipeline, αν υπάρχει·
- το correlation id είναι η τρέχουσα τιμή του source ή ένα νέο id από το source· χωρίς source, λαμβάνει εκείνο του περιβάλλοντος pipeline, ή ένα νέο UUIDv7.

Η αλυσίδα εκτελείται εντός αυτών των τιμών, επομένως οτιδήποτε καλεί (συμπεριλαμβανομένων των εμφωλευμένων pipelines και συναρτήσεων όπως το `currentTenantId()`) τις βλέπει. Τα behaviors των οποίων τα κλειδιά διαχωρίζονται ανά tenant (όπως το cache, το idempotency και τα rate limits) αποτυγχάνουν με ασφάλεια (fail-closed) όταν απαιτούν tenant και η εκτέλεση δεν διαθέτει κανένα.
