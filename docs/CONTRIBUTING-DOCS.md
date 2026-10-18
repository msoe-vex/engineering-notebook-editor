# Contributing to docs

## Where to write

| Change type | Update |
| --- | --- |
| User-visible behavior | Matching `01-requirements/features/FR-*.md` (acceptance criteria) |
| Security / privacy / reliability bar | Matching `01-requirements/quality/NFR-*.md` |
| Irreversible technical choice | New ADR under `02-architecture/decisions/` |
| Service topology / how systems talk | `02-architecture/diagrams.md` (+ short pointer in `overview.md`) |
| HTTP / WSS / Firestore shape | `03-reference/api-contracts.md` or `schema.md` |
| How to run / deploy | `04-guides/` |
| Incidents | `05-ops/runbooks/` |

## IDs

- Feature IDs (`FR-auth`, `FR-entries-collab`, …) are **stable**. Prefer deprecate + new ID over rename.
- Status on FR/NFR: `current` | `partial` | `planned`. `current` must match shipped code.

## PR checklist

- [ ] FR acceptance criteria still accurate (or updated)
- [ ] API/schema updated if contracts changed
- [ ] ADR added if a new non-goal or platform choice landed
- [ ] No second copy of the same fact in product + architecture

## Templates

- [01-requirements/\_templates/FR.md](./01-requirements/_templates/FR.md)
- [01-requirements/\_templates/NFR.md](./01-requirements/_templates/NFR.md)
- ADR style: copy an existing file under `02-architecture/decisions/`
