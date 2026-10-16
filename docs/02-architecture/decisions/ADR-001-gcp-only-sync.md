# ADR-001: GCP-only live sync

Status: accepted  
Date: 2026-10

## Context

The legacy product used GitHub and/or local File System Access as the notebook “source of truth.” The cloud product needs a single multi-user system of record with realtime collaboration.

## Decision

**Firestore + GCS on GCP** are the only live storage backends. The website talks to Core/Collab/Agents; clients do not use the Firestore/GCS SDKs with user credentials.

GitHub commit/pull and Local File System Access are **not** live sync backends and must not be reintroduced as such.

## Consequences

- Legacy GitHub/local UI archived under `website/archive/legacy/`
- Portable backup is ZIP only ([ADR-002](./ADR-002-zip-lww-backup.md))
- Simpler ACL and cascade deletes; no merge-with-remote Git UX in the live shell

## Alternatives considered

- Dual-write to GitHub — rejected (conflict UX, auth surface, not multiplayer-first)
- Keep local FS as primary — rejected (no shared tenancy)
