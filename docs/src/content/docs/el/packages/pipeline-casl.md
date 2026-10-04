---
title: "@cqrs-ddd/pipeline-casl"
description: "Εξουσιοδότηση CASL: έλεγχοι σε επίπεδο τύπου πριν την εκτέλεση της λειτουργίας, και έλεγχοι οντοτήτων και πεδίων στο εσωτερικό της."
sidebar:
  order: 11
---

Εξουσιοδότηση λεπτομερούς ελέγχου βάσει χαρακτηριστικών (ABAC) και ρόλων (RBAC) χρησιμοποιώντας το [CASL](https://casl.js.org).

Επιβάλλει μοντέλο άμυνας σε βάθος δύο επιπέδων (two-tier defense-in-depth):
1. **Εξουσιοδότηση σε επίπεδο τύπου (Type-Level Outer Gate)**: Το `CaslBehavior` αξιολογεί στατικά δικαιώματα πριν την εκτέλεση της λειτουργίας (π.χ. *Μπορεί ο χρήστης να εκτελέσει το `DeleteUserCommand`;*), αποφεύγοντας περιττά queries στη βάση.
2. **Εξουσιοδότηση οντότητας & πεδίων (Entity & Field Inner Gate)**: Το `CaslAuthorizer` αξιολογεί λεπτομερείς κανόνες πάνω σε ενυδατωμένα (hydrated) domain aggregates εντός του handler (π.χ. *Μπορεί ο χρήστης να ενημερώσει το συγκεκριμένο άρθρο όταν `authorId !== currentUserId`;*) και προβάλλει μόνο αναγνώσιμα πεδία.

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/pipeline-casl @cqrs-ddd/pipeline @casl/ability
```

Απαιτεί Node.js 22.12 ή νεότερο και `@casl/ability` 7.

## Αρχιτεκτονική & Ροή εξουσιοδότησης

```text
Εισερχόμενο Αίτημα (Incoming Request)
      │
      ▼
[1. Type-Level Gate: CaslBehavior]
      ├─ Επιλύει το principal και τους κανόνες μέσω ICaslPermissionSource
      ├─ Αξιολογεί τους κανόνες τύπου που δηλώθηκαν με requires({ action, subject })
      ├─ Απόρριψη; ──► Ρίχνει UnauthorizedActionException (HTTP 403)
      └─ Επιτρέπεται ──► Αποθηκεύει Ability & Principal στο IPipelineContext
                           │
                           ▼
[2. Εκτέλεση Handler]
      ├─ Φορτώνει το domain aggregate από το repository (π.χ. post = await repo.findById(id))
      ├─ Δημιουργεί CaslAuthorizer (διαβάζει το Ability από το context)
      ├─ Αξιολογεί authorizer.authorize('update', post, ['title'])
      ├─ Τροποποιεί το aggregate μέσω domain μεθόδων
      ├─ Αποθηκεύει το aggregate
      └─ Επιστρέφει προβληθέντα πεδία: authorizer.project('read', post, dto)
```

## Γρήγορο παράδειγμα

```typescript
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  CaslBehavior,
  type ICaslPermissionSource,
  parseCapabilityString,
  requires,
} from '@cqrs-ddd/pipeline-casl';

const permissionSource: ICaslPermissionSource = {
  load: async (context) => {
    const session = await authService.getCurrentSession();
    if (!session) return null; // Μη αυθεντικοποιημένα αιτήματα απορρίπτονται

    return {
      principal: { id: session.userId, tenantId: session.tenantId, role: session.role },
      rules: session.capabilities.map(parseCapabilityString),
    };
  },
};

const pipeline = createPipeline({
  behaviors: [new CaslBehavior(permissionSource)],
  globalBehaviors: { before: [CaslBehavior] },
});

export const deleteUser = pipeline.wrap(
  { name: 'deleteUser', kind: 'command' },
  requires({ action: 'delete', subject: 'User' }),
)(async (userId: string) => usersRepo.delete(userId));
```

## Μορφή Capability & Παρεμβολή συνθηκών (Interpolation)

Η πηγή δικαιωμάτων φορτώνει κανόνες ως αντικείμενα `Capability`. Για συμπαγή αποθήκευση στη βάση ή claims σε JWT, σειριοποιήστε τα ως capability strings:

```text
Subject|action|conditions|fields
```

| Capability String | Action | Subject | Conditions / Fields | Σημασία |
| --- | --- | --- | --- | --- |
| `Post\|read\|*` | `read` | `Post` | Wildcard | Μπορεί να διαβάσει οποιοδήποτε post |
| `!Post\|delete\|*` | `delete` | `Post` | Inverted (`!`) | Ρητή απαγόρευση διαγραφής posts |
| `Post\|update\|{"authorId":"${user.id}"}\|title,body` | `update` | `Post` | `${user.id}` ταύτιση | Ενημέρωση τίτλου και body μόνο σε δικά του posts |
| `all\|manage\|*` | `manage` | `all` | Wildcard | Superadmin: επιτρέπεται κάθε ενέργεια |

Placeholders της μορφής `${user.<field>}` στις συνθήκες αντικαθίστανται αυτόματα από χαρακτηριστικά του ενεργού `principal`:

```typescript
// Κανόνας: {"tenantId":"${user.tenantId}","department":"${user.dept}"}
// Principal: { id: 'u_1', tenantId: 'org_abc', dept: 'engineering' }
// Αντικατεστημένη συνθήκη: { tenantId: 'org_abc', department: 'engineering' }
```

## Έλεγχοι οντοτήτων και πεδίων (`CaslAuthorizer`)

Μέσα σε command ή query handlers, δημιουργήστε instance του `CaslAuthorizer` για να αξιολογήσετε κανόνες έναντι φορτωμένων οντοτήτων και να καθαρίσετε πεδία εξόδου:

```typescript
import { CaslAuthorizer } from '@cqrs-ddd/pipeline-casl';

export class UpdateArticleHandler {
  async execute(command: UpdateArticleCommand) {
    const authorizer = new CaslAuthorizer();
    const article = await this.articles.findById(command.articleId);

    // 1. Εξουσιοδότηση ενέργειας και τροποποιημένων πεδίων στο aggregate:
    authorizer.authorize('update', article, ['title', 'content']);

    // 2. Εκτέλεση domain mutation:
    article.updateContent(command.title, command.content);
    await this.articles.save(article);

    // 3. Προβολή μόνο των πεδίων που επιτρέπεται να διαβάσει ο καλών:
    return authorizer.project('read', article, {
      id: article.id,
      title: article.title,
      content: article.content,
      internalNotes: article.internalNotes,
    });
  }
}
```

## Ασφάλεια & Διαχωρισμός Cache (`abilityDigest`)

Όταν αποθηκεύετε αποτελέσματα query στην cache (`@cqrs-ddd/pipeline-cache`) ή εκτελείτε replay idempotent commands (`@cqrs-ddd/pipeline-idempotency`), οι απαντήσεις δεν πρέπει ποτέ να διαμοιράζονται μεταξύ διαφορετικών επιπέδων δικαιωμάτων.

Το `abilityDigest(context)` παράγει SHA-256 αποτύπωμα των κανόνων του καλούντος:

```typescript
import { createPartitionedCacheKeyFactory } from '@cqrs-ddd/pipeline-cache';
import { abilityDigest, getCaslPrincipal } from '@cqrs-ddd/pipeline-casl';

const userCacheKey = createPartitionedCacheKeyFactory({
  principal: (ctx) => getCaslPrincipal(ctx)?.id,
  scope: abilityDigest,
});
```

## Ενσωμάτωση NestJS (`@cqrs-ddd/nestjs`)

Καταχωρίστε το `CaslBehavior` σε ένα shared security module:

```typescript
import { Module } from '@nestjs/common';
import { CaslBehavior } from '@cqrs-ddd/pipeline-casl';
import { AuthService } from '../auth/auth.service.js';

@Module({
  providers: [
    {
      provide: CaslBehavior,
      inject: [AuthService],
      useFactory: (auth: AuthService) => new CaslBehavior(auth.permissionSource),
    },
  ],
  exports: [CaslBehavior],
})
export class SecurityModule {}
```

Διακοσμήστε handlers με `requires`:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { requires } from '@cqrs-ddd/pipeline-casl';

@CommandHandler(DeleteArticleCommand)
@UsePipeline(requires({ action: 'delete', subject: 'Article' }))
export class DeleteArticleHandler implements ICommandHandler<DeleteArticleCommand> {
  async execute(command: DeleteArticleCommand) {}
}
```

Το `ErrorFilter` μετατρέπει αυτόματα το `UnauthorizedActionException` σε HTTP 403 Forbidden.

## Σειρά των behaviors

Τοποθετήστε το `CaslBehavior` **πριν** από behaviors cache και idempotency:
1. `ZodValidationBehavior`: Επικυρώνει το input.
2. `CaslBehavior`: Ελέγχει την εξουσιοδότηση.
3. `CacheBehavior` / `IdempotencyBehavior`: Αξιολογεί short-circuit keys μέσω `abilityDigest`.

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-casl/)
