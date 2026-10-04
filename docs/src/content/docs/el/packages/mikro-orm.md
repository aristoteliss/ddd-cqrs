---
title: "@cqrs-ddd/mikro-orm"
description: "MikroORM persistence adapters για το @cqrs-ddd/core: έγκυρη φόρτωση aggregates, εγγραφές με έλεγχο έκδοσης, revision-fenced cache και αντιστοίχιση schema root-entity."
editUrl: false
sidebar:
  order: 41
---
[![npm version](https://img.shields.io/npm/v/@cqrs-ddd/mikro-orm.svg)](https://www.npmjs.com/package/@cqrs-ddd/mikro-orm)
[![License](https://img.shields.io/npm/l/@cqrs-ddd/mikro-orm.svg)](https://www.npmjs.com/package/@cqrs-ddd/mikro-orm)

Adapters για το MikroORM 7 για το [`@cqrs-ddd/core`](https://www.npmjs.com/package/@cqrs-ddd/core): έγκυρη φόρτωση aggregates (authoritative loading), εγγραφές με έλεγχο έκδοσης (version-conditioned writes), persistence dialect που αντιστοιχίζει unique violations και παροδικά σφάλματα, ένα revision-fenced cache αποθηκευμένο στη βάση δεδομένων, και αντιστοίχιση `EntitySchema` για το `RootEntity`.

Το `@cqrs-ddd/core` δεν εξαρτάται από κανένα ORM. Αυτό το πακέτο αποτελεί τη γέφυρα με το MikroORM. Δεν εξαρτάται από κανένα web framework.

## Περιεχόμενα

- [Εγκατάσταση](#εγκατάσταση)
- [Entity manager source](#entity-manager-source)
- [Multi-tenant store](#multi-tenant-store)
- [Φόρτωση aggregates (Loading aggregates)](#φόρτωση-aggregates-loading-aggregates)
- [Εγγραφές με έλεγχο έκδοσης (Version-conditioned writes)](#εγγραφές-με-έλεγχο-έκδοσης-version-conditioned-writes)
- [Σφάλματα persistence](#σφάλματα-persistence)
- [Χαρτογράφηση ενός root entity (Mapping a root entity)](#χαρτογράφηση-ενός-root-entity-mapping-a-root-entity)
- [Το database cache](#το-database-cache)
- [SQL identifiers](#sql-identifiers)
- [Άδεια χρήσης](#άδεια-χρήσης)

## Εγκατάσταση

```bash
pnpm add @cqrs-ddd/mikro-orm @cqrs-ddd/core @mikro-orm/core
```

Απαιτεί Node.js 22.17 ή νεότερο (όπως και το MikroORM 7). Τα `@cqrs-ddd/core` `^0.5.0` και `@mikro-orm/core` `^7.2.3` είναι peer dependencies. Προσθέστε τον driver του MikroORM που χρησιμοποιείτε, όπως `@mikro-orm/postgresql`.

## Entity manager source

Οι adapters δέχονται ένα `IEntityManagerSource`, δηλαδή ένα αντικείμενο με ιδιότητα `em`, και διαβάζουν το `em` σε κάθε λειτουργία. Ένα multi-tenant store μπορεί επομένως να παρέχει τον manager του τρέχοντος tenant, ενώ σε περιβάλλον μίας βάσης δεδομένων αρκεί το `{ em: orm.em.fork() }`.

## Multi-tenant store

Το `TenantStore` αποτελεί την εν λόγω πηγή για multi-tenant εφαρμογές. Τα `em` και `transactional()` δρουν πάνω στο ενεργό tenant που παρέχει η συνάρτηση `tenant()`, ενώ το `orm(tenant)` επιστρέφει το αρχικοποιημένο ORM που περιέχει τα δεδομένα του. Και τα δύο ρίχνουν σφάλμα όταν δεν υπάρχει tenant ή είναι άγνωστο: το store δεν επιστρέφει ποτέ κάποιο default.

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
import { setPersistenceDialect } from '@cqrs-ddd/core/persistence';
import { CacheEntrySchema, MikroOrmDialect, TenantStore } from '@cqrs-ddd/mikro-orm';
import { MikroORM } from '@mikro-orm/core';

const requestTenant = new AsyncLocalStorage<string>();
const orms = new Map<string, MikroORM>();
for (const tenant of ['tenant_a', 'tenant_b']) {
  orms.set(tenant, await MikroORM.init({ ...tenantOptions(tenant), entities: [UserSchema, CacheEntrySchema] }));
}

const store = new TenantStore({
  tenant: () => {
    const tenant = requestTenant.getStore();
    if (!tenant) throw new Error('No tenant in scope.');
    return tenant;
  },
  orm: (tenant) => {
    const orm = orms.get(tenant);
    if (!orm) throw new Error(`Unknown tenant ${tenant}.`);
    return orm;
  },
  isolation: 'database', // ένα ORM και βάση ανά tenant. 'schema': ένα ORM, ξεχωριστό schema ανά tenant
});

const [first] = orms.values();
if (first) setPersistenceDialect(new MikroOrmDialect(first));

await requestTenant.run('tenant_a', () => store.em.findOne(User, { id }));
await requestTenant.run('tenant_a', () =>
  store.transactional((em) => em.nativeDelete(CacheEntry, { key })),
);
```

Με απομόνωση `'schema'`, το `orm` επιστρέφει το ίδιο ORM για κάθε tenant και κάθε manager γίνεται fork με `schema: tenant`. Επικυρώστε το tenant έναντι λίστας επιτρεπόμενων τιμών πριν φτάσει στο store, για παράδειγμα με το `isSqlIdentifier`.

- Το `em` επαναχρησιμοποιεί τον manager του context (MikroORM `RequestContext` ή ενεργό transaction) μόνο όταν ανήκει στο ORM, driver και schema του tenant και κανένα άλλο tenant δεν τον χρησιμοποίησε πρώτο. Διαφορετικά δημιουργεί fork.
- Το `transactional()` εκτελείται πάντοτε σε δικό του fork.
- Το tenant κάθε manager διατηρείται σε `WeakMap`: τα native αντικείμενα του MikroORM δεν τροποποιούνται ποτέ.

## Φόρτωση aggregates (Loading aggregates)

Ένα command που μεταλλάσσει ένα aggregate το φορτώνει μέσω του `IWriteSideAggregateRepository<TEntity>.findById(id)` του core. Το `AggregateRepository` το υλοποιεί: το `findById()` διαβάζει με `{ refresh: true }`, δεν αγγίζει ποτέ την cache, επαναϋδατώνει μέσω του `hydrateFn` που παρέχετε, και μεταφράζει σφάλματα driver με το `mapPersistenceError`.

```typescript
import type { ICache } from '@cqrs-ddd/core/application';
import { cacheKey, PersistedWrite } from '@cqrs-ddd/core/persistence';
import { AggregateRepository, type IEntityManagerSource, optimisticUpdate } from '@cqrs-ddd/mikro-orm';

export class UpdateUserRepository extends AggregateRepository<UserSnapshot, User, UserSnapshot> {
  constructor(cache: ICache<UserSnapshot>, store: IEntityManagerSource) {
    super(cache, store, User, User.aggregateName, User.fromJSON);
  }

  @PersistedWrite<User>({
    cache: { setKey: (user) => cacheKey(User.aggregateName, { id: user.id }) },
  })
  async save(user: User): Promise<UserSnapshot> {
    const snapshot = user.toJSON();
    await optimisticUpdate(
      this.store.em,
      User,
      user,
      { username: snapshot.username, updatedAt: snapshot.updatedAt },
      'User',
    );
    return snapshot;
  }
}

const users = new UpdateUserRepository(cache, store);
const user = await users.findById(id); // πάντα από τη βάση δεδομένων, ποτέ από την cache
```

## Εγγραφές με έλεγχο έκδοσης (Version-conditioned writes)

Τα `optimisticUpdate` και `optimisticDelete` εκτελούν εγγραφές με συνθήκη `WHERE id = ? AND version = expected` για οποιοδήποτε `VersionedAggregate`, ελέγχουν τις επηρεασμένες γραμμές, και εγείρουν τα `EntityNotFoundException` ή `ConcurrencyConflictError` του core. Και τα δύο καλούν πρώτα το `assertAutocommit(em, operation)`: μια εγγραφή μέσα σε εξωτερικό transaction απορρίπτεται πριν εκτελεστεί οποιοδήποτε query, διότι η επιτυχία του δεν θα σήμαινε ανθεκτική αποθήκευση.

```typescript
import { ConcurrencyConflictError } from '@cqrs-ddd/core/domain';
import { optimisticDelete, optimisticUpdate } from '@cqrs-ddd/mikro-orm';

// UPDATE users SET department = ?, updated_at = ?, version = <user.version>
//   WHERE id = <user.id> AND version = <user.getExpectedVersion()>
await optimisticUpdate(store.em, User, user, { department: 'Research', updatedAt: user.updatedAt }, 'User');

try {
  await optimisticDelete(store.em, User, staleUser, 'User');
} catch (error) {
  if (error instanceof ConcurrencyConflictError) {
    // το error.expectedVersion είναι η έκδοση που είχε το staleUser κατά τη φόρτωση
  }
  throw error;
}

await store.em.transactional((em) => optimisticUpdate(em, User, user, fields, 'User')); // απορρίπτεται
```

## Σφάλματα persistence

Το `MikroOrmDialect` υλοποιεί το `IPersistenceDialect` του core. Καταχωρίστε το μόλις αρχικοποιηθεί το ORM, και τα `@MapPersistenceErrors` / `@PersistedWrite` αντιστοιχίζουν αυτόματα παραβιάσεις unique constraints ανά entity property:

```typescript
import { setPersistenceDialect } from '@cqrs-ddd/core/persistence';
import { MikroOrmDialect } from '@cqrs-ddd/mikro-orm';

const orm = await MikroORM.init(options);
setPersistenceDialect(new MikroOrmDialect(orm));

@PersistedWrite<User>({ unique: { email: (user) => new UniqueEmailException(user) } })
async save(user: User): Promise<UserSnapshot> {
  const snapshot = user.toJSON();
  await optimisticUpdate(this.store.em, User, user, { email: snapshot.email }, 'User');
  return snapshot;
}
```

Ένας περιορισμός πολλαπλών στηλών αντιστοιχίζεται με βάση το δηλωμένο του όνομα (`name`):

```typescript
const ROLE_NAME = 'roles_tenant_name_unique';

@PersistedWrite<Role, typeof ROLE_NAME>({
  unique: { [ROLE_NAME]: (role) => new DuplicateRoleNameException(role) },
})
```

Η συνάρτηση `mapPersistenceError(error, operation)` είναι ο μεταφραστής `otherwise` για παροδικά σφάλματα: αναγνωρίζει επαναλήψιμα SQLSTATEs της PostgreSQL (`40001`, `40P01`, `55P03`, `57P01`–`57P03`), σφάλματα δικτύου Node, `SQLITE_BUSY`/`SQLITE_LOCKED` και timeouts, και τα τυλίγει στο `TransientOperationError` του core.

## Χαρτογράφηση ενός root entity (Mapping a root entity)

Τα `rootEntityProperties(columns?)` και `versionProperty(column?)` παρέχουν τις ιδιότητες του `EntitySchema` που χρειάζεται κάθε `RootEntity`, με timestamps αποθηκευμένα ως epoch milliseconds μέσω του `UnixTimestampType`:

```typescript
export const UserSchema = new EntitySchema<User, AggregateRoot>({
  class: User as any,
  tableName: 'users',
  properties: {
    ...rootEntityProperties(),
    version: versionProperty(),
    username: { type: 'string', length: 255, accessor: true },
    department: { type: 'string', length: 255, nullable: true, accessor: true },
    email: { type: 'string', length: 320, unique: true },
  },
});
```

## Το database cache

Το `MikroOrmCache(store, { defaultTtlMs?, logger? })` υλοποιεί το `IVersionedCache` του core με μία γραμμή πίνακα ανά κλειδί, όπου κάθε εγγραφή αποτελεί compare-and-set στο δικό της transaction. Το `store` παρέχει `em` και `transactional(work)`.

```typescript
import { createCacheTableSql, MikroOrmCache } from '@cqrs-ddd/mikro-orm';

// σε migration
await orm.em.getConnection().execute(createCacheTableSql());

const cache = new MikroOrmCache<UserSnapshot>(store, {
  defaultTtlMs: 5 * 60_000,
  logger: { warn: (message) => console.warn(message) },
});
const users = new UpdateUserRepository(cache, store);
const reads = new GetUserRepository(cache, store);
```

- Το `store.transactional(work)` οφείλει να εκτελεί το `work` σε δικό του manager και ποτέ στον manager της τρέχουσας κλήσης.
- Με `TenantStore`, οι εγγραφές cache κάθε tenant ζουν στη βάση ή το schema του συγκεκριμένου tenant.
- Οι αναγνώσεις παρακάμπτουν το identity map.

## SQL identifiers

Το `isSqlIdentifier(name, { qualified? })` ελέγχει αν ένα string είναι ασφαλές SQL identifier χωρίς εισαγωγικά, με προαιρετική υποστήριξη schema qualification. Χρησιμοποιήστε το πριν την παρεμβολή ονομάτων σχημάτων (tenant schemas) σε κείμενο SQL.

## Άδεια χρήσης

Διπλή άδεια υπό **AGPL-3.0-or-later** ή **Commercial License**. Δείτε τα
[`LICENSE`](https://github.com/aristoteliss/ddd-cqrs/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/ddd-cqrs/blob/master/COMMERCIAL_LICENSE.txt)
στη ρίζα του repository.
