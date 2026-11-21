from __future__ import annotations

from typing import Any, Awaitable, Callable

from app import core_client
from app.graph import run_score_graph
from app.llm import set_llm_context
from app.normalize import (
    extract_text_from_source,
    matrix_grounded_in_source,
    normalize_rubric_text,
)
from app.tools import NotebookIndex

ProgressFn = Callable[..., Awaitable[None]]


def resolve_phase(payload: dict[str, Any]) -> str:
    phase = payload.get("phase")
    if phase in ("normalize", "score"):
        return phase
    return "score" if payload.get("judgmentId") else "normalize"


async def ensure_matrix(
    org_id: str,
    notebook_id: str,
    rubric_id: str,
    *,
    force: bool,
    progress: ProgressFn,
) -> tuple[dict[str, Any], dict[str, Any]]:
    await progress("Loading rubric…", 12, stage="load", detail="Opening rubric")
    rubric = await core_client.fetch_rubric(org_id, notebook_id, rubric_id)
    matrix = rubric.get("matrix")

    if (
        not force
        and isinstance(matrix, dict)
        and (matrix.get("categories") or [])
        and rubric.get("status") == "ready"
    ):
        await progress("Rubric ready", 28, stage="load", detail="Using saved matrix")
        return rubric, matrix

    if not rubric.get("sourceGcsPath"):
        if isinstance(matrix, dict) and (matrix.get("categories") or []):
            return rubric, matrix
        raise RuntimeError("Rubric has no source file and no matrix to score")

    await progress(
        "Reading rubric document…",
        18,
        stage="extract",
        detail="Downloading source file",
    )
    raw_bytes = await core_client.fetch_storage_object(
        org_id, notebook_id, rubric["sourceGcsPath"]
    )
    data = raw_bytes or b""
    await progress(
        "Reading rubric document…",
        24,
        stage="extract",
        detail="Extracting text",
    )
    raw_text = await extract_text_from_source(
        str(rubric.get("sourceContentType") or ""),
        data,
        None,
    )

    needs = (
        force
        or not (isinstance(matrix, dict) and (matrix.get("categories") or []))
        or not matrix_grounded_in_source(matrix or {}, raw_text)
    )
    if needs:
        await progress(
            "Building rubric matrix…",
            35,
            stage="normalize",
            detail="Asking the model to structure criteria",
        )
        await core_client.patch_rubric(
            org_id, notebook_id, rubric_id, {"status": "normalizing"}
        )
        matrix = await normalize_rubric_text(raw_text, str(rubric.get("name") or "Rubric"))
        cats = len((matrix or {}).get("categories") or [])
        await progress(
            "Saving matrix…",
            55,
            stage="normalize",
            detail=f"{cats} criteria ready" if cats else "Saving matrix",
        )
        await core_client.patch_rubric(
            org_id,
            notebook_id,
            rubric_id,
            {
                "status": "ready",
                "matrix": matrix,
                "error": "",
            },
        )
    return rubric, matrix  # type: ignore[return-value]


async def run_judge_job(
    *,
    org_id: str,
    notebook_id: str,
    job_id: str,
    payload: dict[str, Any],
) -> None:
    rubric_id = (payload.get("rubricId") or "").strip()
    if not rubric_id:
        raise RuntimeError("payload.rubricId required")

    inference = payload.get("inference") or "byok"
    byok = payload.get("byok") if isinstance(payload.get("byok"), dict) else None
    set_llm_context(str(inference), byok)

    async def progress(
        status: str,
        pct: int,
        *,
        stage: str | None = None,
        detail: str | None = None,
    ) -> None:
        await core_client.report_progress(
            org_id,
            notebook_id,
            job_id,
            status,
            pct,
            stage=stage,
            detail=detail,
        )

    phase = resolve_phase(payload)

    if phase == "normalize":
        await ensure_matrix(org_id, notebook_id, rubric_id, force=True, progress=progress)
        await progress("Finishing…", 95, stage="save", detail="Marking rubric ready")
        await core_client.complete_normalize(org_id, notebook_id, job_id, rubric_id)
        return

    judgment_id = (payload.get("judgmentId") or "").strip()
    if not judgment_id:
        raise RuntimeError("payload.judgmentId required for score phase")

    _, matrix = await ensure_matrix(
        org_id, notebook_id, rubric_id, force=False, progress=progress
    )
    if not (matrix.get("categories") or []):
        raise RuntimeError("Rubric matrix is empty — extract or edit the rubric first")

    await progress(
        "Loading notebook…",
        40,
        stage="notebook",
        detail="Fetching entries for scoring",
    )
    snap = await core_client.fetch_snapshot(org_id, notebook_id)
    index = NotebookIndex.from_snapshot(snap)
    entry_count = len(index.entries)
    await progress(
        "Loading notebook…",
        48,
        stage="notebook",
        detail=f"{entry_count} entries loaded" if entry_count else "No entries yet",
    )

    if not index.entries:
        results = [
            {
                "categoryId": c.get("id"),
                "categoryName": c.get("name"),
                "awardedPoints": 0,
                "maxPoints": c.get("maxPoints") or 0,
                "levelId": (c.get("levels") or [{}])[0].get("id"),
                "levelLabel": (c.get("levels") or [{}])[0].get("label"),
                "rationale": (
                    "No notebook entries were available to evaluate. "
                    "Add entries, then re-run the judge."
                ),
                "entryIds": [],
            }
            for c in matrix.get("categories") or []
        ]
        scored = {
            "categories": results,
            "totalPoints": 0,
            "totalMaxPoints": matrix.get("totalMaxPoints")
            or sum(int(c.get("maxPoints") or 0) for c in matrix.get("categories") or []),
            "summary": (
                "Score is 0 because this notebook has no entries to judge yet. "
                "Create dated entries with design evidence, then run the judge again."
            ),
        }
    else:
        cats = matrix.get("categories") or []
        await progress(
            "Scoring notebook…",
            55,
            stage="score",
            detail=f"Evaluating {len(cats)} criteria",
        )
        scored = await run_score_graph(matrix=matrix, index=index)
        await progress(
            "Scoring notebook…",
            88,
            stage="score",
            detail=f"{scored.get('totalPoints', 0)} / {scored.get('totalMaxPoints', 0)} points",
        )

    await progress("Saving results…", 95, stage="save", detail="Writing grade")
    await core_client.complete_judgment(
        org_id,
        notebook_id,
        judgment_id,
        job_id,
        {
            "rubricId": rubric_id,
            "jobId": job_id,
            "matrix": matrix,
            "categories": scored["categories"],
            "totalPoints": scored["totalPoints"],
            "totalMaxPoints": scored["totalMaxPoints"],
            "summary": scored["summary"],
            "status": "completed",
        },
    )


async def run_judge_job_safe(
    *,
    org_id: str,
    notebook_id: str,
    job_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    try:
        await run_judge_job(
            org_id=org_id, notebook_id=notebook_id, job_id=job_id, payload=payload
        )
        return {"ok": True}
    except Exception as err:
        message = str(err)
        print(f"[judge] failed: {message}")
        rubric_id = (payload.get("rubricId") or "").strip()
        await core_client.fail_judgment(
            org_id,
            notebook_id,
            job_id,
            message,
            judgment_id=(payload.get("judgmentId") or None),
            rubric_id=rubric_id if resolve_phase(payload) == "normalize" else None,
        )
        return {"ok": False, "error": message}
