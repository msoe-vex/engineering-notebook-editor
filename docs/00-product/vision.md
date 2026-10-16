# Vision and scope

## Problem

Engineering design notebooks need collaborative editing, structured metadata (phases, authors, schedule), and printable PDF output—without treating GitHub or a local folder as the system of record.

## Product

A **cloud-native engineering notebook**: organizations own notebooks; members edit entries in real time; compile to PDF; backup via ZIP.

## Users

See [personas.md](./personas.md). Primary: student / team members writing daily design entries; org admins managing access; platform admins operating the service.

## Success signals

- Create org → notebook → entry → collaborate → compile PDF in one session
- Restricted notebooks enforce ACL; invites expire and match email when set
- ZIP export/import restores entries and assets (LWW)
- BYOK GenAI keys never leave the browser except ephemeral request bodies

## In scope

- Orgs, teams (ACL), notebooks, folders, entries, collab, schedule, compile, ZIP, GenAI/audit, account prefs, admin

## Non-goals (do not reintroduce)

- GitHub commit/pull as primary sync — [ADR-001](../02-architecture/decisions/ADR-001-gcp-only-sync.md)
- Local File System Access as primary sync — same ADR
- Storing BYOK keys in Firestore — [ADR-003](../02-architecture/decisions/ADR-003-byok-keys-local.md)
- Embedding TipTap / Yjs bodies in Firestore docs

## History

Pre-cloud local/GitHub UI is archived: [`website/archive/legacy/`](../../website/archive/legacy/). See [`website/LEGACY.md`](../../website/LEGACY.md).
