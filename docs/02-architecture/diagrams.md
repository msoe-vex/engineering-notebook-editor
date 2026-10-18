# Architecture diagrams

Canonical pictures of how services talk. Contracts stay in [api-contracts](../03-reference/api-contracts.md); decisions in [ADRs](./decisions/). Related narrative: [overview](./overview.md), [realtime](./realtime.md), [tenancy-acl](./tenancy-acl.md).

## System context

Browser clients talk to **Core** (REST + SSE) and **Collab** (Yjs WSS). Workers never accept browser traffic — Core dispatches jobs over the internal network.

```mermaid
flowchart LR
  subgraph Clients
    Web["website<br/>Next.js :3000"]
  end

  subgraph Edge["Compose / Cloud Run"]
    Core["core<br/>Fastify :8080"]
    Collab["collab<br/>Hocuspocus :1234"]
    Compile["compile<br/>XeLaTeX :8090"]
    Judge["judge<br/>Python LangGraph :8091"]
  end

  subgraph GCP["Data & identity"]
    Auth["Firebase Auth"]
    FS["Firestore"]
    GCS["GCS / fake-gcs"]
    Vertex["Vertex AI"]
  end

  Web -->|"REST + Bearer<br/>SSE …/events"| Core
  Web -->|"WSS Yjs<br/>entry bodies"| Collab
  Web -.->|"BYOK GenAI<br/>(browser → provider)"| ExtLLM["OpenAI / Anthropic / Gemini"]

  Collab -->|"/internal/collab/*"| Core
  Core -->|"POST /jobs"| Compile
  Core -->|"POST /jobs"| Judge
  Compile -->|"snapshot, storage,<br/>export, progress"| Core
  Judge -->|"rubric, snapshot,<br/>storage, AI, progress"| Core

  Core --> Auth
  Core --> FS
  Core --> GCS
  Core -->|"/ai/complete<br/>platformAi"| Vertex
  Judge -->|"/internal/ai/byok|complete"| Core
  Core -.->|"proxies BYOK"| ExtLLM
```

### Ports (local)

| Service | Port | Public to browser? |
| --- | --- | --- |
| website | 3000 | yes |
| core | 8080 | yes (REST/SSE) |
| collab | 1234 | yes (WSS) |
| compile | 8090 | **no** (Core only) |
| judge | 8091 | **no** (Core only) |
| firebase emulators | 9099 / 8081 / 4000 | yes (dev) |
| fake-gcs | 4443 | Core / workers (Docker DNS) |

---

## Sequence: collaborative entry edit

Bodies sync over Collab; metadata over Core SSE. Detail: [realtime.md](./realtime.md).

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant Collab
  participant Core
  participant GCS
  participant FS as Firestore

  B->>Collab: WSS connect + auth
  Collab->>Collab: Authorize notebook access
  Note over B,Collab: Editor waits for Hocuspocus synced
  B->>Collab: Yjs updates (TipTap)
  Collab->>Core: POST /internal/collab/flush
  Core->>GCS: Persist Yjs (+ TipTap path as needed)
  B->>Core: PUT …/entries/:id/content (TipTap mirror)
  Core->>GCS: TipTap JSON
  B->>Core: PATCH …/entries/:id (title, date, …)
  Core->>FS: Metadata write
  Core-->>B: SSE entry.upserted
```

---

## Sequence: async compile job

UI never calls the compile worker. Single-flight via `jobLocks`. See [ADR-006](./decisions/ADR-006-compile-job.md).

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant Core
  participant FS as Firestore
  participant Compile
  participant GCS

  B->>Core: GET …/events (SSE)
  B->>Core: POST …/compile
  Core->>FS: jobs/{jobId} queued + lock
  Core->>Compile: POST /jobs {type:compile,…}
  Core-->>B: 202 { jobId }
  Compile->>Core: GET /internal/compile/snapshot
  Core-->>Compile: paths-v1 metadata
  loop Each entry / asset
    Compile->>Core: GET /internal/storage/object?key=
    Core->>GCS: Read TipTap / asset bytes
    Core-->>Compile: bytes
  end
  Compile->>Compile: TipTap → LaTeX → XeLaTeX
  Compile->>Core: POST /internal/compile/progress
  Core-->>B: SSE job.progress
  Compile->>Core: PUT /internal/compile/export
  Core->>GCS: exports/latest.pdf
  Core->>FS: job succeeded, lastCompiled
  Core-->>B: SSE job.done
```

---

## Sequence: judge — normalize rubric

Upload stores the PDF; extract/normalize is a separate job (`phase=normalize`).

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant Core
  participant GCS
  participant Judge
  participant LLM as Provider via Core AI

  B->>Core: POST …/rubrics (raw PDF bytes)
  Core->>GCS: rubric source object
  Core-->>B: 201 rubric {status:uploaded}
  B->>Core: POST …/rubrics/:id/normalize {inference, byok?}
  Core->>Judge: POST /jobs {phase:normalize, byok?}
  Core-->>B: 202 { jobId }
  Judge->>Core: GET /internal/judge/rubric
  Judge->>Core: GET /internal/storage/object (PDF)
  Core->>GCS: Read source
  Core-->>Judge: PDF bytes
  Judge->>Judge: pymupdf extract text
  Judge->>Core: POST /internal/ai/byok|complete
  Core->>LLM: Generate matrix JSON
  LLM-->>Core: text
  Core-->>Judge: text
  Judge->>Core: PATCH rubric {matrix, status:ready}
  Judge->>Core: POST /internal/judge/normalize-complete
  Core-->>B: SSE job.done
```

---

## Sequence: judge — score notebook (LangGraph)

Score requires a ready matrix. Worker gathers evidence with tools, then scores. See [ADR-007](./decisions/ADR-007-python-langgraph-judge.md).

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant Core
  participant Judge
  participant GCS
  participant LLM as Provider via Core AI

  B->>Core: POST …/judge {rubricId, inference, byok?}
  Core->>Core: Create judgments/{id} running
  Core->>Judge: POST /jobs {phase:score, judgmentId, byok?}
  Core-->>B: 202 { jobId, judgmentId }
  Judge->>Core: GET rubric + snapshot
  Note over Judge: LangGraph gather_evidence
  loop list / search / read tools
    Judge->>Core: GET snapshot / storage object
    Core->>GCS: TipTap JSON
    Core-->>Judge: entry text
  end
  Note over Judge: score_categories → summarize
  Judge->>Core: POST /internal/ai/byok|complete
  Core->>LLM: Score / summarize
  LLM-->>Judge: JSON + rationale (UUIDs inline)
  Judge->>Core: POST /internal/judge/complete
  Core-->>B: SSE job.done
  B->>Core: GET …/judgments/:id
```

---

## Sequence: asset upload

Browser uploads through Core (avoids GCS CORS). Collab/editor references `asset.id` in TipTap.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant Core
  participant FS as Firestore
  participant GCS

  B->>Core: POST …/assets {contentType, byteSize}
  Core->>FS: assets/{id} metadata
  Core-->>B: { asset, uploadPath }
  B->>Core: PUT …/assets/:id/content (bytes)
  Core->>GCS: Put object
  Core-->>B: 200
  B->>Core: PATCH entry { assetIds }
  Core->>FS: Update entry
  Core-->>B: SSE entry.upserted
```

---

## Sequence: GenAI title / caption (BYOK vs Vertex)

Judge always goes through Core for inference. Titles/captions may call the provider from the browser (BYOK) or Core Vertex.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant Core
  participant Vertex
  participant Prov as OpenAI/Anthropic/Gemini

  alt BYOK title/caption
    B->>Prov: Direct or Next /api/genai BFF
    Prov-->>B: completion
  else Vertex title/caption
    B->>Core: POST /ai/complete (platformAi)
    Core->>Vertex: Predict
    Vertex-->>Core: text
    Core-->>B: text
  else Judge score (always Core-proxied)
    Note over B,Core: See judge score sequence
    B->>Core: POST …/judge + byok in body
    Core->>Judge: dispatch (keys not stored)
    Judge->>Core: /internal/ai/byok
    Core->>Prov: completion
  end
```

---

## Job dispatch (Core → worker)

```mermaid
flowchart LR
  UI["Website"] -->|"POST …/compile<br/>POST …/judge<br/>POST …/jobs"| Core
  Core --> Lock["jobLocks single-flight"]
  Core --> Jobs["Firestore jobs/{id}"]
  Core --> Port["JobDispatchPort"]
  Port -->|"JOB_DISPATCH=http"| HTTP["HttpJobDispatch"]
  Port -.->|"JOB_DISPATCH=tasks<br/>future"| Tasks["Cloud Tasks"]
  HTTP -->|"COMPILE_SERVICE_URL"| Compile
  HTTP -->|"JUDGE_SERVICE_URL"| Judge
  Compile --> Internal["/internal/compile/*"]
  Judge --> InternalJ["/internal/judge/* + /internal/ai/*"]
  Internal --> Core
  InternalJ --> Core
  Core --> SSE["SSE job.* to browser"]
```
