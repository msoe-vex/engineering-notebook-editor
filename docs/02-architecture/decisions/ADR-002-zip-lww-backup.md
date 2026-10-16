# ADR-002: ZIP as LWW backup (not sync)

Status: accepted  
Date: 2026-10

## Context

Users need offline portability and migration between environments without restoring GitHub as a sync backend.

## Decision

v5 **ZIP export/import** is the backup/bridge format. Import is **last-write-wins** against the open notebook (remap asset IDs). It is not a CRDT sync protocol and does not replace Core/Collab.

## Consequences

- Product copy and docs must say “backup,” not “sync”
- Optional future LWW push/pull adapters may reuse ZIP semantics after cloud is hardened
- Feature requirements: [FR-zip](../../01-requirements/features/FR-zip.md)

## Alternatives considered

- GitHub round-trip as backup — rejected (reintroduces OAuth and merge semantics)
- Bidirectional realtime sync to external stores — out of scope
