# ADR-009: Platform ports for metadata, storage, identity, notifications

Status: accepted (direction)  
Date: 2026-11  
Related: [ADR-001](./ADR-001-gcp-only-sync.md), [plan](../../01-requirements/plans/platform-ports.md)

## Context

Core already has thin ports for **auth verify** (`AuthPort`), **blobs** (`StoragePort`), and **job wake** (`JobDispatchPort`). Metadata (Firestore), Collab’s parallel Firebase Admin usage, Vertex completion, and outbound email are still vendor-shaped. We want the option to swap cloud vendors later without rewriting product logic, and we need richer identity UX (reset, verify, multi-email, social link) without locking those features to Firebase-only call sites.

## Decision

1. **Ports first, adapters second.** Product and route code depend on interfaces; GCP/Firebase are the **default adapters**, not the domain model. Job wake is **Pub/Sub-only** ([ADR-008](./ADR-008-job-dispatch-evolution.md)) — HTTP Core→worker wake is retired.  
2. **Add `MetadataStore`** — all durable app documents go through it. Firestore is the first adapter. Logical path helpers in `packages/shared` remain IDs, not SDK types.  
3. **Keep `StoragePort`** as the only blob API; GCS remains the first adapter.  
4. **Grow identity behind a port** (evolve `AuthPort`): session verify for Core + Collab; client identity adapter for sign-in/reset/verify/link. Roles/grants stay in app metadata, not required IdP custom claims.  
5. **Add `NotificationPort`** for application transactional email (and future channels). IdP-native verify/reset mail may remain delegated until branding requires app-owned templates.  
6. **One live backend set per deployment** — no dual-write. [ADR-001](./ADR-001-gcp-only-sync.md) still forbids GitHub / local FS as live sync; this ADR does **not** authorize a second simultaneous cloud.  
7. **GenAI complete port** is optional follow-on; not required to start metadata/identity/notification work.

## Consequences

- Plan: [platform-ports.md](../../01-requirements/plans/platform-ports.md)  
- Requirements: [FR-auth](../../01-requirements/features/FR-auth.md), [FR-notifications](../../01-requirements/features/FR-notifications.md)  
- **Shipped (2026-11):** MetadataStore `get/set/update/delete/query/batch` covering Core business routes (orgs, judge, public, admin, compile snapshot, collab flush); Collab `/internal/collab/authorize`; NotificationPort console + Resend; secondary emails; **StoragePort hardening** (product blob IO via port only; object-key contract in schema/async-jobs; workers via Core `/internal/storage/object`). Remaining stretch: optional GenAiCompletePort; second-cloud adapters only when a real migration is scheduled.  
- A future AWS/Mongo/Cognito (or similar) migration is an **adapter + ops** project, not a product rewrite.  
- Collab must not be a second source of truth for identity/membership (authorize via Core).

## Alternatives considered

- **Stay Firestore-idiomatic forever** — fastest short term; blocks any serious multi-cloud story.  
- **Replace Firebase Auth now with custom auth** — high cost; Firebase (or another IdP) as an adapter is enough if the port is right.  
- **Only NotificationPort, skip MetadataStore** — helps email, does not fix the real swap blocker.
