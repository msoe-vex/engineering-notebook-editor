# ADR-008: Job dispatch via Pub/Sub (JobDispatchPort)

Status: accepted  
Date: 2026-11  
Does **not** replace [ADR-006](./ADR-006-compile-job.md) job protocol.

## Context

Workers need a wake path that matches local and GCP. HTTP Core→worker POSTs diverged from how we want to operate on Cloud Run and made local testing a different shape.

## Decision

1. **`JobDispatchPort` is Pub/Sub-only** (`JOB_DISPATCH=pubsub` default; `none` for tests).  
2. Core **publishes** `EnqueueJobInput` JSON to per-type topics; workers **pull** subscriptions and run in-process handlers.  
3. Same topic/subscription names locally (emulator) and in GCP.  
4. No HTTP wake fallback; workers expose `GET /health` only for healthchecks.  
5. Cloud Tasks is not used.

## Consequences

- Compose includes Pub/Sub emulator + init.  
- [async-jobs.md](../async-jobs.md) is the living map.  
- Issue [#93](https://github.com/msoe-vex/engineering-notebook-editor/issues/93) tracks remaining prod IAM/deploy polish.

## Alternatives considered

- HTTP wake / dual path — rejected (no local↔prod parity).  
- Cloud Tasks-only — weaker emulator story than Pub/Sub.
