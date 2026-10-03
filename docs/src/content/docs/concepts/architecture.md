---
title: Architecture Map
description: Visual architecture diagram and package map of the repository.
---

Interactive visual architecture and dependency graph of all `@cqrs-ddd` packages, pipeline behaviors, domain event flow, and the reference API application.

<div style="margin: 2rem 0; border: 1px solid #334155; border-radius: 8px; overflow: hidden; background: #0b0f19;">
  <div style="padding: 0.75rem 1rem; background: #1e293b; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155;">
    <span style="font-weight: 600; font-size: 0.9rem; color: #f8fafc;">Archify Interactive Architecture Map</span>
    <a href="/ddd-cqrs/architecture-diagram.html" target="_blank" rel="noopener noreferrer" style="font-size: 0.85rem; text-decoration: none; color: #60a5fa;">
      Open full-screen ↗
    </a>
  </div>
  <iframe
    src="/ddd-cqrs/architecture-diagram.html"
    title="ddd-cqrs Architecture Map"
    style="width: 100%; height: 820px; border: none; display: block;"
    loading="lazy"
  ></iframe>
</div>

## Architectural Overview

### 1. CQRS & Pipeline Orchestration
- **`@cqrs-ddd/cqrs`**: Builds lightweight `CommandBus`, `QueryBus`, and `EventBus` via `createCqrs()` without framework DI containers.
- **`@cqrs-ddd/pipeline`**: Encapsulates cross-cutting execution behaviors (`LoggingBehavior`, `CacheBehavior`, `CaslBehavior`, etc.) around domain handlers.
- **Contract-Based Request Kinds**: Request routing uses `Symbol.for('@cqrs-ddd/request-kind')` to avoid direct coupling between pipeline and domain layers.

### 2. Domain Events & Async Background Jobs
- **Buffered Domain Events**: Aggregates buffer domain events (`UserCreatedEvent`, `UserUpdatedEvent`, `RoleCreatedEvent`, etc.) during state mutations.
- **Automatic Event Dispatch**: `CommandBaseHandler` automatically publishes buffered events through `EventBus` after durable persistence succeeds.
- **Context-Preserving Queues**: `BullMqUserEventDispatcher` packages messages with `withJobContext()`, preserving caller tenant, principal, and correlation IDs across Redis queues.
- **Isolated Processors**: Background job workers (`SendWelcomeEmailProcessor`, `BatchUpdateUsersProcessor`) execute decorated with `@InJobContext`, restoring the full execution context without leaking between jobs.

### 3. Pure Domain & Persistence
- **`@cqrs-ddd/core`**: Framework-neutral DDD primitives (`AggregateRoot`, `Entity`, `ValueObject`, `DomainEvent`, domain errors) with zero dependencies.
- **`@cqrs-ddd/mikro-orm`**: Implements write-side repository abstractions with version-conditioned optimistic concurrency (`optimisticUpdate`) and anti-resurrection mutation barriers.
- **Two-Layer Caching**: Repository entity snapshot caching (`@FromCache`, `@Cache`) is kept separate from composed pipeline response caching (`CacheBehavior`).

### 4. Application & Reference Implementation
- **`api/`**: Reference REST application demonstrating dual Express and Fastify adapters, multi-tenant isolation, BullMQ background workers, and session management.
