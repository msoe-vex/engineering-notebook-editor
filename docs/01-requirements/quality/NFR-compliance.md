# NFR-compliance: Compliance posture

Status: partial  
Related: [NFR-privacy](./NFR-privacy.md), [NFR-security](./NFR-security.md)

## Requirement

- Clear data-plane boundaries (Auth / Firestore metadata / GCS blobs / no client Admin SDK).
- Document where student or organizational data lives for future FERPA/GDPR reviews.
- Production secrets in Secret Manager / env—not in git.

## Current implementation

Architecture and schema docs describe stores; local emulator project `demo-engineering-notebook`.

## Verification

- Review [schema](../../03-reference/schema.md) + [architecture overview](../../02-architecture/overview.md) during security review

## Gaps

- Written retention / deletion SLA for end users
- Region pinning / data residency commitments (if required by customers)
