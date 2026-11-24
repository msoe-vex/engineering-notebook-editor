# ADR-010: Better Auth & Third-Party Integration Vault

Status: accepted  
Date: 2026-11  
Related: [ADR-001](./ADR-001-gcp-only-sync.md), [ADR-009](./ADR-009-platform-ports.md)

## Context

Platform authentication currently relies on Firebase Auth. While functional for baseline email and Google login, expanding the product to include:
1. Multi-provider social logins (GitHub, Discord, LinkedIn, Google),
2. Persistent, scoped OAuth 2.0 access tokens for third-party integrations (e.g. GitHub backups, Discord message readers via MCP, pull request entry generators), and
3. Native account linking (connecting GitHub and Discord to a primary profile)

presents significant friction with Firebase Auth:
- Firebase Auth does not store or refresh downstream provider OAuth tokens in the application database after initial authentication.
- Adding non-standard providers (Discord, LinkedIn) requires custom OIDC identity provider setups and higher-tier vendor plans.
- Vendor lock-in prevents self-hosting or straightforward local-first testing without the Firebase Auth emulator.

## Decision

1. **Adopt Better Auth for web authentication**:
   - Next.js acts as the auth authority using Better Auth handlers under `/api/auth/[...all]`.
   - Providers supported: GitHub, Discord, Google, LinkedIn, and Email/Password.
   - Built-in social account linking allows users to bind GitHub and Discord to their account.
2. **Issue standard signed JWTs for Core & Collab**:
   - The Better Auth JWT plugin signs tokens containing user identity (`sub`, `email`).
   - Fastify Core verifies tokens via a new `BetterAuthAdapter` implementing `AuthPort` ([ADR-009](./ADR-009-platform-ports.md)).
3. **Persist integration tokens via `MetadataStore`**:
   - Better Auth account documents store `accessToken`, `refreshToken`, and expiry times.
   - Core and autonomous workers (e.g., Discord MCP servers, GitHub backup routines) access these tokens directly through `MetadataStore` without round-tripping to a third-party auth service.
   - Sensitive tokens are encrypted at rest using AES-256-GCM.
4. **Preserve `AuthPort` abstraction**:
   - Core and Collab routes continue to depend exclusively on `AuthPort`.
   - Switching from `FirebaseAuthAdapter` to `BetterAuthAdapter` is an adapter-level toggle with zero breaking changes to tenancy, RBAC, or notebook business logic.

## Consequences

- Next.js gains `@better-auth` dependencies and route handlers.
- Fastify Core gains `BetterAuthAdapter` implementing `AuthPort`.
- Organization and user integration vaults can safely store refreshable OAuth credentials for MCP and automated sync jobs.
- Local development works with zero reliance on cloud auth endpoints.
