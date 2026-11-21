# Plan: Platform ports (metadata, storage, identity, notifications)

**Status:** Epics A–D shipped (stretch GenAi / second-cloud adapters deferred)  
**Created:** 2026-11-17  
**Audience:** engineering + product  
**Related:** [ADR-009](../../02-architecture/decisions/ADR-009-platform-ports.md), [FR-auth](../features/FR-auth.md), [FR-notifications](../features/FR-notifications.md), [backlog](../backlog.md), [roadmap](../../00-product/roadmap.md)

Make Core (and Collab) talk to infrastructure through **ports/adapters** so GCP/Firebase remain the *current* adapters, not hard-wired forever. Ship auth product gaps (password reset, verification, multi-email / social linking) on top of an identity-agnostic surface, plus a notification port for app email.

When an item ships, update the linked FR/ADR and check it off here.

---

## Goals

1. **Metadata behind a port** — stop scattering `getFirestore()` idioms through routes; one repository / store API Core owns.
2. **Blob storage stays on `StoragePort`** — keep GCS as the first adapter; ensure Collab/workers never assume GCS SDK shapes.
3. **Identity & session behind ports** — verify tokens, manage verification/reset/link flows without baking Firebase into product UI beyond a thin client adapter.
4. **Notifications behind a port** — transactional email (and later other channels) for invites, reset/verify when not delegated to the IdP, compile/job alerts.
5. **Stay single-backend at runtime** — one metadata store + one blob store + one IdP adapter per deployment (no dual-write). Platform-agnostic means *swappable adapters*, not multi-cloud simultaneously ([ADR-001](../../02-architecture/decisions/ADR-001-gcp-only-sync.md) still forbids GitHub/local as live sync).

## Non-goals

- Implementing AWS/Mongo/Cognito adapters in the first pass (design ports so they *can* exist later).
- Replacing Firebase Auth with a fully custom password vault in v1.
- Building a general-purpose messaging platform (SMS, push) before email works.
- Dual-writing Firestore ↔ Mongo or GCS ↔ S3.

---

## Port inventory

| Port | Status today | Target |
| --- | --- | --- |
| `AuthPort` / **IdentityPort** | Session verify + Collab authorize via Core | ✅ shipped for current product |
| `StoragePort` | GCS + memory | ✅ Key layout documented; SDK confined to GCS adapter |
| `JobDispatchPort` | Pub/Sub | Unchanged here — see [ADR-008](../../02-architecture/decisions/ADR-008-job-dispatch-evolution.md) |
| **MetadataStore** | Firestore adapter; Core business routes | ✅ Epic A done (transactions still TBD) |
| **NotificationPort** | console / Resend / none | ✅ Epic D core path; optional job-ready email open |
| **GenAiCompletePort** (stretch) | Vertex hardcoded | Optional follow-on |

Website: no direct Firestore/GCS; may keep a **client Identity adapter** (Firebase JS today) that only handles sign-in UI and token acquisition.

---

## Epic A — MetadataStore

**P0 for portability**

- [x] Define `MetadataStore` (`get`/`set`/`update`/`delete`/`query`/`batch`; transaction still TBD) with document IDs matching logical paths in [`packages/shared` paths](../../../packages/shared/src/paths.ts)
- [x] Firestore adapter implements the port (`services/core/src/db/metadataStore.ts`)
- [x] Migrate routes — `users`, `rbac`, `jobStore`, `orgs`, `judge` (rubrics/judgments), `public`, `admin`, `internalCompile`, collab yjs/flush
- [x] Confine remaining `getFirestore()` to the Firestore adapter (`metadataStore.ts` + `firestore.ts` init)
- [x] Collab membership reads go through Core internal ACL (`POST /internal/collab/authorize`)

**Done when:** Core business routes import `MetadataStore`, not `firebase-admin/firestore` types. ✅

## Epic B — StoragePort hardening

**P1** — **done (2026-11)** (docs + audit; no second-cloud adapter)

- [x] Confirm all blob IO (assets, TipTap, Yjs, exports) goes through `StoragePort`
  - Core product routes use injected `StoragePort` only; `@google-cloud/storage` stays in `services/core/src/storage/gcsStorage.ts`
  - Collab / compile / judge use Core internal APIs (no storage SDK)
- [x] Document object-key contract in [schema](../../03-reference/schema.md) / [async-jobs](../../02-architecture/async-jobs.md) as adapter-agnostic (`gcsKeys` in `packages/shared`)
- [x] Workers receive bytes via Core internal APIs only — see async-jobs “Blob IO”; exception: ops BusyTeX upload script

**Done when:** swapping in an S3 adapter would not require route rewrites—only factory wiring + env. ✅ (field names like `gcsPath` remain historical strings; rename optional later)

## Epic C — Identity (password reset, verification, multi-email / social)

**P0 product / P1 port shape**

See [FR-auth](../features/FR-auth.md).

- [x] **Email verification** — gate + resend (IdP-sent)
- [x] **Password reset** — forgot-password + reset via Firebase client helpers / emulator
- [x] **Social login** — Google + GitHub hooks (providers must be enabled in Firebase console; emulator limited)
- [x] **Account linking** — link/unlink Google/GitHub from Account (cannot unlink sole method)
- [x] **Multi-email** — secondary emails on `users/{uid}` with verify via `NotificationPort`; invite matching accepts verified secondaries
- [x] Core `AuthPort` session includes `uid`, email, `emailVerified`; **roles/grants stay in MetadataStore**
- [x] Collab verifies via Core authorize (same AuthPort + rbac/MetadataStore)

**Done when:** user can reset password, verify email, sign in with ≥1 social provider, link a second provider, and add a verified secondary email for invite matching.

## Epic D — NotificationPort

**P1** — [FR-notifications](../features/FR-notifications.md)

- [x] `NotificationPort.send({ to, template|subject+body, data })`
- [x] Adapters: `console` (local), `resend` (`NOTIFICATION_PROVIDER` + `RESEND_API_KEY`), `none`
- [x] Use for: org invites, secondary-email verification
- [ ] Optional: job/compile “ready” email; admin/system alerts
- [x] IdP still owns primary verify/reset templates

**Done when:** Core can send at least one product email without importing a vendor SDK outside the adapter package. ✅

---

## Suggested delivery order

1. ~~Epic C product + Epic D + Epic A + Epic B~~ **done (2026-11)**  
2. Stretch: `GenAiCompletePort`; second-cloud adapters only when a real migration is scheduled  
3. UX plans largely shipped: [cloud-ux-hardening](./cloud-ux-hardening.md), [mobile-responsive](./mobile-responsive.md), [explorer-search](./explorer-search-context-menus.md)

---

## Testing / local

| Concern | Local approach |
| --- | --- |
| Identity | Firebase Auth emulator (current); later any IdP emulator behind the same client adapter |
| Metadata | Firestore emulator behind MetadataStore |
| Blobs | fake-gcs / memory StoragePort |
| Email | NotificationPort → console/Mailhog; no real sends in CI |

Compose should keep **one adapter set** that mirrors prod shapes (same as Pub/Sub topic parity philosophy).

---

## Doc / issue updates when shipping

- FR-auth / FR-notifications acceptance criteria  
- [overview](../../02-architecture/overview.md) ports section  
- [schema](../../03-reference/schema.md) for secondary emails / linked providers  
- [env-vars](../../03-reference/env-vars.md) for notification provider keys  
- New GitHub issues per epic if work is split across PRs
