# NFR-privacy: Privacy & secrets

Status: current  
Related: [ADR-003](../../02-architecture/decisions/ADR-003-byok-keys-local.md), [FR-account](../features/FR-account.md)

## Requirement

- BYOK / GenAI API keys must not be stored in Firestore (or any server preference document).
- TipTap bodies, Yjs, images, PDFs stay in GCS—not Firestore docs.
- Audit scorecards store summaries/advice, not full entry bodies.

## Current implementation

`preferences` on `users/{uid}` omit keys; localStorage + ephemeral Agents request body for BYOK; GCS for blobs.

## Verification

- Inspect `PATCH /users/me` payloads and Firestore user docs after settings save — no `apiKey` fields
- Schema “must NOT go in Firestore” table — [schema](../../03-reference/schema.md)

## Gaps

- Formal DPA / retention policy docs for production tenants (see NFR-compliance)
