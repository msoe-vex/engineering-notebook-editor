# Runbook: Auth failures

## Symptoms

Users cannot sign in; APIs return 401; invite accept fails unexpectedly.

## Checks

1. Firebase Auth status / emulator vs prod config (`NEXT_PUBLIC_USE_FIREBASE_EMULATOR`)
2. Core `AUTH_FALLBACK` — must be `false` in production
3. Clock skew on tokens
4. Invite: expired? email mismatch?

## Mitigations

- Confirm website Firebase project id matches Core `FIREBASE_PROJECT_ID`
- For local: Auth emulator UI http://localhost:4000
- Rotate / re-issue invites if `expiresAt` passed

Related: [FR-auth](../../01-requirements/features/FR-auth.md), [NFR-security](../../01-requirements/quality/NFR-security.md)
