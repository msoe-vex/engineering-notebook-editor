from __future__ import annotations

import asyncio
import re
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.llm import chat_complete, extract_json_array, get_llm_context
from app.tools import NotebookIndex, build_tools

UUID_RE = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
    re.I,
)
SCORE_BATCH = 4


class JudgeState(TypedDict, total=False):
    matrix: dict[str, Any]
    evidence: dict[str, str]
    results: list[dict[str, Any]]
    summary: str
    known_ids: list[str]


def entry_ids_from_text(text: str, known_ids: list[str]) -> list[str]:
    known = {k.lower(): k for k in known_ids}
    found: list[str] = []
    seen: set[str] = set()
    for m in UUID_RE.finditer(text or ""):
        key = m.group(0).lower()
        if key in known and key not in seen:
            seen.add(key)
            found.append(known[key])
    return found


def build_score_graph(index: NotebookIndex):
    tools = {t.name: t for t in build_tools(index)}
    search_entries = tools["search_entries"]
    read_entry = tools["read_entry"]
    list_entries = tools["list_entries"]

    async def gather_evidence(state: JudgeState) -> JudgeState:
        """Agentic retrieval: search + read per criterion using LangChain tools."""
        matrix = state["matrix"]
        evidence: dict[str, str] = {}
        catalog = await list_entries.ainvoke({})
        for cat in matrix.get("categories") or []:
            cid = str(cat.get("id") or "")
            name = str(cat.get("name") or "")
            section = str(cat.get("section") or "")
            query = f"{section} {name}".strip()
            hits = await search_entries.ainvoke({"query": query or name or "notebook"})
            # Pull full bodies for top UUIDs mentioned in search hits
            ids = entry_ids_from_text(hits, [e["id"] for e in index.entries])[:3]
            bodies: list[str] = []
            for eid in ids:
                bodies.append(await read_entry.ainvoke({"entry_id": eid}))
            evidence[cid] = (
                f"Catalog:\n{catalog}\n\nSearch ({query!r}):\n{hits}\n\n"
                + ("\n\n".join(bodies) if bodies else "")
            )
        return {**state, "evidence": evidence}

    async def score_categories(state: JudgeState) -> JudgeState:
        matrix = state["matrix"]
        evidence = state.get("evidence") or {}
        cats = matrix.get("categories") or []
        known = list(state.get("known_ids") or [e["id"] for e in index.entries])
        results: list[dict[str, Any]] = []
        ctx = get_llm_context()
        pause = (
            2.5
            if ctx.get("inference") == "byok"
            and (ctx.get("byok") or {}).get("provider") == "gemini"
            else 0.4
        )

        for b in range(0, len(cats), SCORE_BATCH):
            if b > 0 and pause > 0:
                await asyncio.sleep(pause)
            batch = cats[b : b + SCORE_BATCH]
            blocks = []
            for cat in batch:
                levels = "\n".join(
                    f"  - {l.get('id')} ({l.get('points')} pts) {l.get('label')}: {l.get('description')}"
                    for l in (cat.get("levels") or [])
                )
                ev = (evidence.get(str(cat.get("id"))) or "")[:8000]
                blocks.append(
                    f"### categoryId={cat.get('id')}\n"
                    f"name={cat.get('name')}\nmaxPoints={cat.get('maxPoints')}\n"
                    f"levels:\n{levels}\n\nEvidence:\n{ev}"
                )
            user = (
                "Score EACH rubric category from the evidence. "
                "Cite supporting entries by embedding their full UUID in the rationale.\n\n"
                + "\n\n".join(blocks)
                + '\n\nReturn ONLY JSON: {"results":[{"categoryId":string,"awardedPoints":number,'
                '"levelId":string,"levelLabel":string,"rationale":string}]}'
            )
            raw = await chat_complete(
                system=(
                    "You are an impartial engineering notebook judge. "
                    "Score only from provided evidence. Put entry UUIDs verbatim in rationale."
                ),
                user=user,
                temperature=0.15,
            )
            parsed = extract_json_array(raw)
            by_id = {str(p.get("categoryId") or ""): p for p in parsed if isinstance(p, dict)}
            for cat in batch:
                p = by_id.get(str(cat.get("id"))) or {}
                max_pts = int(cat.get("maxPoints") or 0)
                try:
                    awarded = int(p.get("awardedPoints"))
                except (TypeError, ValueError):
                    awarded = 0
                awarded = max(0, min(max_pts, awarded))
                rationale = str(p.get("rationale") or "")[:4000]
                results.append(
                    {
                        "categoryId": cat.get("id"),
                        "categoryName": cat.get("name"),
                        "awardedPoints": awarded,
                        "maxPoints": max_pts,
                        "levelId": p.get("levelId"),
                        "levelLabel": p.get("levelLabel"),
                        "rationale": rationale,
                        "entryIds": entry_ids_from_text(rationale, known),
                    }
                )
        return {**state, "results": results}

    async def summarize(state: JudgeState) -> JudgeState:
        matrix = state["matrix"]
        results = state.get("results") or []
        total = sum(int(r.get("awardedPoints") or 0) for r in results)
        total_max = int(
            matrix.get("totalMaxPoints")
            or sum(int(r.get("maxPoints") or 0) for r in results)
        )
        lines = "\n".join(
            f"- {r.get('categoryName')}: {r.get('awardedPoints')}/{r.get('maxPoints')} — {r.get('rationale')}"
            for r in results
        )
        ctx = get_llm_context()
        if (
            ctx.get("inference") == "byok"
            and (ctx.get("byok") or {}).get("provider") == "gemini"
        ):
            await asyncio.sleep(2.0)
        summary = await chat_complete(
            system=(
                "Summarize the engineering notebook judgment in 2–4 sentences for students. "
                "Keep any entry UUIDs that appear in the category feedback."
            ),
            user=f"Title: {matrix.get('title')}\nScore: {total}/{total_max}\nCategories:\n{lines}",
            temperature=0.3,
        )
        return {**state, "summary": summary.strip()[:4000]}

    g = StateGraph(JudgeState)
    g.add_node("gather_evidence", gather_evidence)
    g.add_node("score_categories", score_categories)
    g.add_node("summarize", summarize)
    g.set_entry_point("gather_evidence")
    g.add_edge("gather_evidence", "score_categories")
    g.add_edge("score_categories", "summarize")
    g.add_edge("summarize", END)
    return g.compile()


async def run_score_graph(
    *, matrix: dict[str, Any], index: NotebookIndex
) -> dict[str, Any]:
    graph = build_score_graph(index)
    final = await graph.ainvoke(
        {
            "matrix": matrix,
            "evidence": {},
            "results": [],
            "summary": "",
            "known_ids": [e["id"] for e in index.entries],
        }
    )
    results = final.get("results") or []
    total = sum(int(r.get("awardedPoints") or 0) for r in results)
    total_max = int(
        matrix.get("totalMaxPoints")
        or sum(int(r.get("maxPoints") or 0) for r in results)
    )
    return {
        "categories": results,
        "totalPoints": total,
        "totalMaxPoints": total_max,
        "summary": final.get("summary") or "",
    }
