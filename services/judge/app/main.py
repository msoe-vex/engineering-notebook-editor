from __future__ import annotations

import asyncio
import json
import os
import threading
import time
from typing import Any

from fastapi import FastAPI
from google.cloud import pubsub_v1

from app.run_job import run_judge_job_safe

app = FastAPI(title="notebook-judge", version="2.0.0")

_busy = False
_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
_worker_task: asyncio.Task | None = None
_loop: asyncio.AbstractEventLoop | None = None

_project = (
    os.environ.get("GOOGLE_CLOUD_PROJECT")
    or os.environ.get("GCP_PROJECT_ID")
    or os.environ.get("FIREBASE_PROJECT_ID")
    or "demo-engineering-notebook"
)
_subscription = os.environ.get("PUBSUB_SUBSCRIPTION_JUDGE") or "notebook-jobs-judge-worker"


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


def _enqueue_from_message(data: bytes) -> None:
    body = json.loads(data.decode("utf8"))
    org_id = str(body.get("orgId") or "").strip()
    notebook_id = str(body.get("notebookId") or "").strip()
    job_id = str(body.get("jobId") or "").strip() or f"job-{int(time.time())}"
    job_type = str(body.get("type") or "judge").strip()
    if not org_id or not notebook_id:
        raise ValueError("orgId and notebookId required")
    if job_type != "judge":
        raise ValueError(f"unsupported job type: {job_type}")
    assert _loop is not None
    fut = asyncio.run_coroutine_threadsafe(
        _queue.put(
            {
                "orgId": org_id,
                "notebookId": notebook_id,
                "jobId": job_id,
                "payload": body.get("payload") or {},
            }
        ),
        _loop,
    )
    fut.result(timeout=30)
    print(f"[judge] accepted job={job_id} from pubsub")


def _start_pubsub_pull() -> None:
    subscriber = pubsub_v1.SubscriberClient()
    path = subscriber.subscription_path(_project, _subscription)
    print(f"[judge] pubsub pull subscription={_subscription} project={_project}")

    def callback(message: pubsub_v1.subscriber.message.Message) -> None:
        try:
            _enqueue_from_message(message.data)
            message.ack()
        except Exception as err:  # noqa: BLE001
            print(f"[judge] pubsub message error: {err}")
            message.nack()

    streaming_pull = subscriber.subscribe(path, callback=callback)

    def _watch() -> None:
        try:
            streaming_pull.result()
        except Exception as err:  # noqa: BLE001
            print(f"[judge] pubsub subscription stopped: {err}")

    threading.Thread(target=_watch, name="pubsub-pull", daemon=True).start()


@app.on_event("startup")
async def _startup() -> None:
    global _worker_task, _loop
    _loop = asyncio.get_running_loop()
    _worker_task = asyncio.create_task(_drain())
    _start_pubsub_pull()


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "judge",
        "runtime": "python-langgraph",
        "busy": _busy,
        "queued": _queue.qsize(),
        "subscription": _subscription,
    }
