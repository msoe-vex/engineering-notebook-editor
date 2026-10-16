# NFR-security: Security & tenancy

Status: current  
Related: [tenancy-acl](../../02-architecture/tenancy-acl.md), [FR-auth](../features/FR-auth.md), [FR-orgs](../features/FR-orgs.md)

## Requirement

- Clients never access Firestore/GCS with user credentials; Admin SDK only in Core/Collab/Agents (`firestore.rules` deny).
- Every Core/Agents mutating route authenticates and authorizes org/notebook access (restricted mode respected).
- Collab WSS authenticates unless explicitly disabled for local smoke (`COLLAB_AUTH_DISABLED`).
- Invites expire and optionally bind to email.

## Current implementation

Firebase Auth bearer → Core; nested Firestore paths; Agents audit ACL; invite `expiresAt` + email match.

## Verification

- Attempt restricted notebook without grant → omitted from list / 403
- Accept expired invite → 400
- Firestore client SDK write from browser → denied by rules

## Gaps

- Finer per-entry ACLs not required yet
