from __future__ import annotations

import os
from typing import Any

import httpx

_TIMEOUT = httpx.Timeout(120.0, connect=30.0)


def core_base() -> str:
    return (os.environ.get("CORE_API_URL") or "http://core:8080").rstrip("/")


def _headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    h = dict(extra or {})
    secret = os.environ.get("INTERNAL_SERVICE_SECRET")
    if secret:
        h["x-internal-secret"] = secret
    return h


async def fetch_rubric(org_id: str, notebook_id: str, rubric_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.get(
            f"{core_base()}/internal/judge/rubric",
            params={"orgId": org_id, "notebookId": notebook_id, "rubricId": rubric_id},
            headers=_headers({"Accept": "application/json"}),
        )
        res.raise_for_status()
        return res.json()


async def patch_rubric(
    org_id: str, notebook_id: str, rubric_id: str, patch: dict[str, Any]
) -> None:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.patch(
            f"{core_base()}/internal/judge/rubric",
            headers=_headers({"content-type": "application/json"}),
            json={"orgId": org_id, "notebookId": notebook_id, "rubricId": rubric_id, **patch},
        )
        res.raise_for_status()


async def fetch_snapshot(org_id: str, notebook_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.get(
            f"{core_base()}/internal/compile/snapshot",
            params={"orgId": org_id, "notebookId": notebook_id},
            headers=_headers({"Accept": "application/json"}),
        )
        res.raise_for_status()
        return res.json()


async def fetch_storage_object(org_id: str, notebook_id: str, key: str) -> bytes | None:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.get(
            f"{core_base()}/internal/storage/object",
            params={"orgId": org_id, "notebookId": notebook_id, "key": key},
            headers=_headers(),
        )
        if res.status_code == 404:
            return None
        res.raise_for_status()
        return res.content


async def report_progress(
    org_id: str, notebook_id: str, job_id: str, status: str, progress: int
) -> None:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            await client.post(
                f"{core_base()}/internal/judge/progress",
                headers=_headers({"content-type": "application/json"}),
                json={
                    "orgId": org_id,
                    "notebookId": notebook_id,
                    "jobId": job_id,
                    "status": status,
                    "progress": progress,
                },
            )
    except Exception:
        pass


async def complete_normalize(
    org_id: str, notebook_id: str, job_id: str, rubric_id: str
) -> None:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.post(
            f"{core_base()}/internal/judge/normalize-complete",
            headers=_headers({"content-type": "application/json"}),
            json={
                "orgId": org_id,
                "notebookId": notebook_id,
                "jobId": job_id,
                "rubricId": rubric_id,
            },
        )
        res.raise_for_status()


async def complete_judgment(
    org_id: str,
    notebook_id: str,
    judgment_id: str,
    job_id: str,
    result: dict[str, Any],
) -> None:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.post(
            f"{core_base()}/internal/judge/complete",
            headers=_headers({"content-type": "application/json"}),
            json={
                "orgId": org_id,
                "notebookId": notebook_id,
                "judgmentId": judgment_id,
                "jobId": job_id,
                "result": result,
            },
        )
        res.raise_for_status()


async def fail_judgment(
    org_id: str,
    notebook_id: str,
    job_id: str,
    error: str,
    judgment_id: str | None = None,
    rubric_id: str | None = None,
) -> None:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            body: dict[str, Any] = {
                "orgId": org_id,
                "notebookId": notebook_id,
                "jobId": job_id,
                "error": error,
            }
            if judgment_id:
                body["judgmentId"] = judgment_id
            if rubric_id:
                body["rubricId"] = rubric_id
            await client.post(
                f"{core_base()}/internal/judge/failed",
                headers=_headers({"content-type": "application/json"}),
                json=body,
            )
    except Exception:
        pass


async def ai_complete(
    *,
    inference: str,
    byok: dict[str, str] | None,
    prompt: str,
    temperature: float = 0.2,
) -> str:
    payload: dict[str, Any] = {
        "prompt": prompt,
        "temperature": temperature,
    }
    if inference == "vertex":
        payload["provider"] = "vertex"
    else:
        if not byok or not byok.get("model"):
            raise RuntimeError("BYOK credentials missing on judge job")
        payload["provider"] = byok.get("provider") or "openai"
        payload["apiKey"] = byok.get("apiKey", "")
        payload["model"] = byok["model"]
        if byok.get("baseUrl"):
            payload["baseUrl"] = byok["baseUrl"]

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.post(
            f"{core_base()}/internal/ai/complete",
            headers=_headers({"content-type": "application/json"}),
            json=payload,
        )
        text = res.text
        try:
            data = res.json()
        except Exception:
            data = {}
        if not res.is_success:
            raise RuntimeError(data.get("error") or f"LLM {res.status_code}: {text[:300]}")
        out = (data.get("text") or "").strip()
        if not out:
            raise RuntimeError("LLM returned empty text")
        return out
