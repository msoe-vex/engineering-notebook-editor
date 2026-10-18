from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from langchain_core.tools import tool

from app.core_client import fetch_storage_object
from app.tiptap import tip_tap_to_plain


@dataclass
class NotebookIndex:
    org_id: str
    notebook_id: str
    entries: list[dict[str, Any]] = field(default_factory=list)
    _cache: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_snapshot(cls, snap: dict[str, Any]) -> "NotebookIndex":
        org_id = str(snap.get("orgId") or "")
        notebook_id = str(snap.get("notebookId") or "")
        entries_raw = snap.get("entries") or {}
        entries: list[dict[str, Any]] = []
        for eid, meta in entries_raw.items():
            if not isinstance(meta, dict):
                continue
            if meta.get("deletedAt") or meta.get("isTemplate"):
                continue
            entries.append(
                {
                    "id": eid,
                    "title": meta.get("title") or "Untitled",
                    "date": meta.get("date") or "",
                    "tipTapGcsPath": meta.get("tipTapGcsPath") or "",
                }
            )
        entries.sort(key=lambda e: (e.get("date") or "", e.get("title") or ""))
        return cls(org_id=org_id, notebook_id=notebook_id, entries=entries)

    async def read_plain(self, entry_id: str, max_chars: int = 4000) -> str:
        if entry_id in self._cache:
            return self._cache[entry_id][:max_chars]
        meta = next((e for e in self.entries if e["id"] == entry_id), None)
        if not meta or not meta.get("tipTapGcsPath"):
            return ""
        raw = await fetch_storage_object(self.org_id, self.notebook_id, meta["tipTapGcsPath"])
        if not raw:
            return ""
        try:
            doc = json.loads(raw.decode("utf-8"))
            text = tip_tap_to_plain(doc)
        except Exception:
            text = ""
        self._cache[entry_id] = text
        return text[:max_chars]


def build_tools(index: NotebookIndex):
    @tool
    async def list_entries() -> str:
        """List notebook entries as id | date | title (exclude trash/templates)."""
        if not index.entries:
            return "(no entries)"
        return "\n".join(
            f"- {e['id']} | {e['date']} | {e['title']}" for e in index.entries
        )

    @tool
    async def search_entries(query: str) -> str:
        """Keyword search over entry titles and bodies. Returns top matches with snippets."""
        q = (query or "").strip().lower()
        if not q:
            return "query required"
        tokens = [t for t in re.split(r"[^a-z0-9]+", q) if len(t) >= 2]
        if not tokens:
            return "no usable tokens"
        scored: list[tuple[int, dict[str, Any], str]] = []
        for e in index.entries:
            title = str(e.get("title") or "")
            body = await index.read_plain(e["id"], max_chars=3000)
            hay = f"{title}\n{body}".lower()
            score = sum(hay.count(t) for t in tokens)
            if score <= 0:
                continue
            # snippet around first token hit
            idx = min((hay.find(t) for t in tokens if t in hay), default=0)
            start = max(0, idx - 60)
            snippet = body[start : start + 220].replace("\n", " ").strip()
            scored.append((score, e, snippet))
        scored.sort(key=lambda x: -x[0])
        top = scored[:8]
        if not top:
            return f"No matches for {query!r}"
        lines = []
        for score, e, snippet in top:
            lines.append(
                f"- {e['id']} | {e['title']} (score={score})\n  snippet: {snippet or '(empty)'}"
            )
        return "\n".join(lines)

    @tool
    async def read_entry(entry_id: str) -> str:
        """Read plain-text body of one entry by UUID."""
        eid = (entry_id or "").strip()
        meta = next((e for e in index.entries if e["id"] == eid), None)
        if not meta:
            return f"unknown entry id {eid}"
        body = await index.read_plain(eid, max_chars=5000)
        return f"Entry {eid} — {meta['title']} ({meta['date']})\n\n{body or '(empty)'}"

    return [list_entries, search_entries, read_entry]
