from __future__ import annotations

import asyncio
import os
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from app.run_job import run_judge_job_safe

app = FastAPI(title="notebook-judge", version="2.0.0")

_secret = os.environ.get("INTERNAL_SERVICE_SECRET") or ""
_busy = False
_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
_worker_task: asyncio.Task | None = None


def _assert_secret(x_internal_secret: str | None) -> None:
    if _secret and x_internal_secret != _secret:
        raise HTTPException(status_code=403, detail="forbidden")


async def _drain() -> None:
    global _busy
    while True:
        job = await _queue.get()
        _busy = True
        try:
            print(
                f"[judge] start job={job['jobId']} notebook={job['notebookId']} "
                f"(python/langgraph)"
            )
            await run_judge_job_safe(
                org_id=job["orgId"],
                notebook_id=job["notebookId"],
                job_id=job["jobId"],
                payload=job.get("payload") or {},
            )
        finally:
            _busy = False
            _queue.task_done()


@app.on_event("startup")
async def _startup() -> None:
    global _worker_task
    _worker_task = asyncio.create_task(_drain())


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "judge",
        "runtime": "python-langgraph",
        "busy": _busy,
        "queued": _queue.qsize(),
    }


@app.post("/jobs")
async def enqueue_job(
    request: Request,
    x_internal_secret: str | None = Header(default=None),
) -> JSONResponse:
    _assert_secret(x_internal_secret)
    try:
        body = await request.json()
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    org_id = str(body.get("orgId") or "").strip()
    notebook_id = str(body.get("notebookId") or "").strip()
    job_id = str(body.get("jobId") or "").strip() or f"job-{int(asyncio.get_event_loop().time())}"
    job_type = str(body.get("type") or "judge").strip()
    if not org_id or not notebook_id:
        raise HTTPException(status_code=400, detail="orgId and notebookId required")
    if job_type != "judge":
        raise HTTPException(status_code=400, detail=f"unsupported job type: {job_type}")

    await _queue.put(
        {
            "orgId": org_id,
            "notebookId": notebook_id,
            "jobId": job_id,
            "payload": body.get("payload") or {},
        }
    )
    return JSONResponse({"ok": True, "jobId": job_id}, status_code=202)
