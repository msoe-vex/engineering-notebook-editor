# Plan: Platform ports (metadata, storage, identity, notifications)

**Status:** planned  
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
| `AuthPort` / **IdentityPort** | Thin `verifySession` only (`services/core/src/auth/`) | Verify + claims enrichment; Collab uses same path (or Core-only ACL) |
| `StoragePort` | GCS + memory | Keep; document key layout; no SDK leakage outside adapter |
| `JobDispatchPort` | HTTP | Unchanged here — see [ADR-008](../../02-architecture/decisions/ADR-008-job-dispatch-evolution.md) |
| **MetadataStore** (new) | Missing — Firestore everywhere | Documents/collections/batches via store API; Firestore = first adapter |
| **NotificationPort** (new) | Missing | `sendEmail` (and later templates/channels); Resend/SES/SMTP adapters |
| **GenAiCompletePort** (stretch) | Vertex hardcoded | Optional follow-on; not blocking auth/email |

Website: no direct Firestore/GCS; may keep a **client Identity adapter** (Firebase JS today) that only handles sign-in UI and token acquisition.

---

## Epic A — MetadataStore

**P0 for portability**

- [ ] Define `MetadataStore` (get/set/delete/query/batch/transaction) with document IDs matching logical paths in [`packages/shared` paths](../../../packages/shared/src/paths.ts) — paths stay **logical**, not Firestore-specific in call sites
- [ ] Firestore adapter implements the port; `getFirestore()` confined to `db/firestore*` adapter files
- [ ] Migrate routes incrementally (`users`, `orgs`, `jobStore`, `rbac`, audits, judge metadata)
- [ ] Collab membership reads go through Core internal ACL **or** a shared store client that only uses the port (no second Firebase Admin + path dialect)

**Done when:** Core business routes import `MetadataStore`, not `firebase-admin/firestore` types.

## Epic B — StoragePort hardening

**P1**

- [ ] Confirm all blob IO (assets, TipTap, Yjs, exports) goes through `StoragePort`
- [ ] Document object-key contract in [schema](../../03-reference/schema.md) / async-jobs as adapter-agnostic
- [ ] Workers receive bytes via Core internal APIs only (already the direction)

**Done when:** swapping in an S3 adapter would not require route rewrites—only factory wiring + env.

## Epic C — Identity (password reset, verification, multi-email / social)

**P0 product / P1 port shape**

See [FR-auth](../features/FR-auth.md).

- [ ] **Email verification** — keep gate; ensure resend works; document whether mail is IdP-sent or `NotificationPort`
- [ ] **Password reset** — forgot-password + reset confirmation UX; Firebase `sendPasswordResetEmail` (or IdP equivalent) acceptable for v1 if behind Identity client helpers
- [ ] **Social login** — configure providers (at least GitHub + Google; LinkedIn via OIDC if feasible); sign-in buttons on auth chrome
- [ ] **Account linking** — signed-in user can link/unlink providers; conflict UX when provider email already bound to another uid
- [ ] **Multi-email** — primary email from IdP; **secondary emails** stored on `users/{uid}` (app metadata) with verify-via-`NotificationPort` (or IdP) before use for invites matching
- [ ] Expand Core `AuthPort` → session includes `uid`, primary email, `emailVerified`, linked provider ids; **roles/grants stay in MetadataStore** (not IdP custom claims required)
- [ ] Collab verifies via shared Identity verify (same adapter as Core)

**Done when:** user can reset password, verify email, sign in with ≥1 social provider, link a second provider, and add a verified secondary email for invite matching.

## Epic D — NotificationPort

**P1** — [FR-notifications](../features/FR-notifications.md)

- [ ] `NotificationPort.send({ to, template|subject+body, data })`
- [ ] First adapter: free/cheap transactional provider (e.g. Resend) **or** SMTP; local = log/Ethreal/Mailhog
- [ ] Use for: org invites (optional branded), secondary-email verification, job/compile “ready” (optional), admin/system alerts
- [ ] IdP may still send its own verify/reset templates; do not fork two product templates for the same event without a decision in the FR

**Done when:** Core can send at least one product email without importing a vendor SDK outside the adapter package.

---

## Suggested delivery order

1. **Epic C (product slice):** password reset + tighten verification UX (can ship on Firebase client before full IdentityPort rename)
2. **Epic D skeleton:** `NotificationPort` + local logger adapter + one invite or secondary-email template
3. **Epic A:** `MetadataStore` + Firestore adapter; migrate hottest routes
4. **Epic C (linking):** social providers + link/unlink + secondary emails
5. **Epic B:** storage audit / docs
6. Stretch: `GenAiCompletePort`; second-cloud adapters only when a real migration is scheduled

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
