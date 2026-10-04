---
title: Χάρτης Αρχιτεκτονικής
description: Διαδραστικό διάγραμμα αρχιτεκτονικής και χάρτης πακέτων του repository.
---

Διαδραστικό διάγραμμα αρχιτεκτονικής και γράφος εξαρτήσεων όλων των πακέτων `@cqrs-ddd`, των behaviors του pipeline, της ροής domain events και της ενδεικτικής εφαρμογής API.

<div style="margin: 2rem 0; border: 1px solid #334155; border-radius: 8px; overflow: hidden; background: #0b0f19;">
  <div style="padding: 0.75rem 1rem; background: #1e293b; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155;">
    <span style="font-weight: 600; font-size: 0.9rem; color: #f8fafc;">Διαδραστικός Χάρτης Αρχιτεκτονικής Archify</span>
    <a href="/ddd-cqrs/architecture-diagram.html" target="_blank" rel="noopener noreferrer" style="font-size: 0.85rem; text-decoration: none; color: #60a5fa;">
      Άνοιγμα σε πλήρη οθόνη ↗
    </a>
  </div>
  <iframe
    src="/ddd-cqrs/architecture-diagram.html"
    title="Χάρτης Αρχιτεκτονικής ddd-cqrs"
    style="width: 100%; height: 820px; border: none; display: block;"
    loading="lazy"
  ></iframe>
</div>

## Επισκόπηση Αρχιτεκτονικής

### 1. CQRS & Ενορχήστρωση Pipeline
- **`@cqrs-ddd/cqrs`**: Δημιουργεί ελαφριά `CommandBus`, `QueryBus` και `EventBus` μέσω του `createCqrs()` χωρίς DI containers κάποιου framework.
- **`@cqrs-ddd/pipeline`**: Ενθυλακώνει οριζόντια behaviors εκτέλεσης (`LoggingBehavior`, `CacheBehavior`, `CaslBehavior`, κ.λπ.) γύρω από domain handlers.
- **Request Kinds βασισμένα σε συμβόλαια**: Η δρομολόγηση αιτημάτων χρησιμοποιεί το `Symbol.for('@cqrs-ddd/request-kind')` για να αποφεύγεται η άμεση σύζευξη μεταξύ του pipeline και των domain επιπέδων.

### 2. Domain Events & Ασύγχρονες Εργασίες Παρασκηνίου
- **Buffered Domain Events**: Τα aggregates αποθηκεύουν προσωρινά domain events (`UserCreatedEvent`, `UserUpdatedEvent`, `RoleCreatedEvent`, κ.λπ.) κατά τη διάρκεια μεταβολών κατάστασης.
- **Αυτόματη Δημοσίευση Events**: Ο `CommandBaseHandler` δημοσιεύει αυτόματα τα αποθηκευμένα events μέσω του `EventBus` μετά την επιτυχή ανθεκτική αποθήκευση.
- **Queues με διατήρηση Context**: Ο `BullMqUserEventDispatcher` πακετάρει μηνύματα με το `withJobContext()`, διατηρώντας το tenant, το principal και το correlation id του καλούντος σε ουρές Redis.
- **Απομονωμένοι Processors**: Οι workers παρασκηνίου (`SendWelcomeEmailProcessor`, `BatchUpdateUsersProcessor`) εκτελούνται με τον decorator `@InJobContext`, επαναφέροντας το πλήρες context εκτέλεσης χωρίς διαρροές μεταξύ εργασιών.

### 3. Καθαρό Domain & Persistence
- **`@cqrs-ddd/core`**: Δομικά στοιχεία DDD ανεξάρτητα από framework (`AggregateRoot`, `Entity`, `ValueObject`, `DomainEvent`, domain errors) χωρίς εξωτερικές εξαρτήσεις.
- **`@cqrs-ddd/mikro-orm`**: Υλοποιεί αφαιρέσεις repositories για write-side λειτουργίες με έλεγχο ταυτοχρονισμού βάσει έκδοσης (`optimisticUpdate`) και mutation barriers προστασίας από επαναφορά διεγραμμένων εγγραφών.
- **Caching δύο επιπέδων**: Το caching snapshots οντοτήτων στο repository (`@FromCache`, `@Cache`) διατηρείται αυστηρά ξεχωριστό από το caching συντεθειμένων αποτελεσμάτων στο pipeline (`CacheBehavior`).

### 4. Εφαρμογή Αναφοράς
- **`api/`**: Πλήρης REST εφαρμογή αναφοράς που επιδεικνύει διπλούς adapters για Express και Fastify, απομόνωση multi-tenant, BullMQ background workers και διαχείριση sessions.
