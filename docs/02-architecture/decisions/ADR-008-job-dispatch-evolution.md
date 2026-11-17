# ADR-008: Job dispatch evolution (HTTP → Pub/Sub; Cloud Tasks optional)

Status: accepted (direction)  
Date: 2026-11  
Supersedes the earlier “Tasks-first / Pub/Sub optional” draft; does **not** replace [ADR-006](./ADR-006-compile-job.md).

## Context

[ADR-006](./ADR-006-compile-job.md) ships durable notebook jobs with `JobDispatchPort`. Locally, Core uses **HTTP** to wake `compile` / `judge` containers. That is fine as an interim, but **HTTP local + a different prod wake path** (Cloud Tasks) still means two dispatch shapes to reason about.

We want **1:1 local ↔ prod** for the wake mechanism: same publish/subscribe model, same topic/subscription names; only host and credentials differ. GCP **Pub/Sub** plus the **Pub/Sub emulator** in Compose is the cleanest way to get that. ADR-006’s rejection of “Pub/Sub *required for modularity*” still stands — modularity lives in the **job protocol** — but Pub/Sub is justified for **parity and operational clarity**, not for inventing a second job model.

## Decision

1. **Keep** Compose worker containers (`compile`, `judge`), Core job docs, and SSE.  
2. **Next dispatch step:** `JOB_DISPATCH=pubsub` — Core publishes job messages; workers subscribe (push or pull). Local Compose adds the Pub/Sub emulator; topic/sub names match prod.  
3. **HTTP** (`JOB_DISPATCH=http`) remains the **current** default until Pub/Sub dispatch lands; then it becomes a fallback / offline mode.  
4. **Cloud Tasks** stays available as an optional alternate `JobDispatchPort` if we ever want push-HTTP wake without a bus — not the preferred path for local parity.  
5. Do not reintroduce a separate Agents HTTP service for job execution; workers stay internal-only.

## Consequences

- Docs/roadmap describe HTTP workers as **current**, Pub/Sub as **preferred next**, Tasks as **optional alternate**.  
- Issue [#93](https://github.com/msoe-vex/engineering-notebook-editor/issues/93) tracks Pub/Sub dispatch + emulator parity on top of shipped workers.  
- [async-jobs.md](../async-jobs.md) is the living map.  
- Worker `/jobs` HTTP handlers can remain as the *handler* invoked by a push subscription, or workers pull and call the same run path — either way the job protocol is unchanged.

## Alternatives considered

- **Cloud Tasks as the only prod path** — workable, but local usually stays HTTP → weaker 1:1 testing.  
- **Stay on HTTP forever** — simplest short term; diverges from how we want to operate multi-worker GCP.  
- **Sync-only Core** — already rejected in ADR-006.
