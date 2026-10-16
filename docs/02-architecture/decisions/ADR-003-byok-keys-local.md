# ADR-003: BYOK keys stay local

Status: accepted  
Date: 2026-10

## Context

GenAI (titles, captions, rubric audit) needs provider API keys for BYOK users. Storing keys in Firestore would expand blast radius and compliance burden.

## Decision

- **Never** persist GenAI/BYOK API keys in Firestore or other server preference documents
- Keys live in **browser localStorage** (or equivalent) and may be sent only in **ephemeral request bodies** to Agents/GenAI routes
- `PATCH /users/me` preferences may store non-secret GenAI settings (provider, model ids, base URLs, enabled flag)

## Consequences

- Account hydrate restores theme/provider without keys; user re-enters keys per browser if needed
- Privacy NFR: [NFR-privacy](../../01-requirements/quality/NFR-privacy.md)
- Feature: [FR-account](../../01-requirements/features/FR-account.md), [FR-genai-audit](../../01-requirements/features/FR-genai-audit.md)

## Alternatives considered

- Encrypt keys at rest in Firestore — deferred (KMS + threat model not justified yet)
- Org-managed secrets vault — future, not BYOK browser keys
