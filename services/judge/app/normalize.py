from __future__ import annotations

import math
import re
from typing import Any

import fitz  # pymupdf

from app.llm import chat_complete, extract_json_object

SYSTEM = """You convert competition design-notebook rubrics into a standardized JSON matrix.
Return ONLY JSON with this shape:
{
  "title": string,
  "sourceName": string,
  "categories": [
    {
      "id": string (slug),
      "name": string,
      "section": string (optional section/group header from the rubric),
      "description": string,
      "maxPoints": number,
      "levels": [
        { "id": string, "label": string, "description": string, "points": number }
      ]
    }
  ],
  "totalMaxPoints": number
}
Rules:
- Extract ONLY criteria that appear in the source. Never invent categories.
- Prefer one category per scored criterion/row.
- If the rubric groups criteria under section headers, put that header in "section".
- Copy level labels and point values exactly when present.
- maxPoints for a category = highest level points for that criterion.
- totalMaxPoints MUST equal the document's stated total when present.
- ids: lowercase kebab or snake, unique."""


def looks_like_extract_garbage(text: str) -> bool:
    t = text.strip()
    if not t or len(t) < 80:
        return True
    pdf_markers = len(re.findall(r"%PDF|endstream|/FlateDecode|/Type\s*/Page|\bxref\b", t, re.I))
    letters = len(re.findall(r"[A-Za-z]", t))
    letter_ratio = letters / max(len(t), 1)
    if pdf_markers >= 2 and letter_ratio < 0.55:
        return True
    has_lexicon = bool(
        re.search(
            r"\b(exemplary|proficient|developing|beginning|criteria|points?|rubric|total)\b",
            t,
            re.I,
        )
    )
    if not has_lexicon and letter_ratio < 0.45:
        return True
    return False


def _normalize_phrase(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def matrix_grounded_in_source(matrix: dict[str, Any], raw_text: str) -> bool:
    cats = matrix.get("categories") or []
    if not cats or looks_like_extract_garbage(raw_text):
        return False
    lower = _normalize_phrase(raw_text)
    hits = 0
    for cat in cats:
        name = _normalize_phrase(str(cat.get("name") or ""))
        if len(name) < 4:
            continue
        if name in lower:
            hits += 1
            continue
        core = [
            w
            for w in name.split()
            if len(w) >= 4 and w not in {"with", "from", "that", "this", "their", "team", "and", "the"}
        ]
        if len(core) >= 2 and " ".join(core) in lower:
            hits += 1
    return hits >= math.ceil(len(cats) * 0.7)


def declared_total_from_text(raw_text: str) -> int | None:
    m = re.search(r"\btotal\s*\(\s*out of\s*(\d+)\s*\)", raw_text, re.I) or re.search(
        r"\btotal\s*[:\s]+(?:out of\s*)?(\d+)", raw_text, re.I
    )
    if not m:
        return None
    n = int(m.group(1))
    return n if n > 0 else None


def extract_pdf_text(data: bytes) -> str:
    doc = fitz.open(stream=data, filetype="pdf")
    try:
        parts = [page.get_text("text") for page in doc]
    finally:
        doc.close()
    text = "\n\n".join(parts)
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


async def extract_text_from_source(
    content_type: str, data: bytes, existing_raw: str | None = None
) -> str:
    ct = (content_type or "").lower()
    is_pdf = "pdf" in ct or data[:5] == b"%PDF-"
    if is_pdf:
        try:
            from_pdf = extract_pdf_text(data)
            if not looks_like_extract_garbage(from_pdf):
                return from_pdf[:200_000]
        except Exception as err:
            print(f"[judge] pdf extract failed: {err}")
        if existing_raw and existing_raw.strip() and not looks_like_extract_garbage(existing_raw):
            return existing_raw.strip()[:200_000]
        raise RuntimeError(
            "Cannot extract text from this PDF (scanned/image-only or encrypted). "
            "Upload a text-based PDF, .txt, or .md."
        )

    if existing_raw and existing_raw.strip() and not looks_like_extract_garbage(existing_raw):
        return existing_raw.strip()

    if (
        ct.startswith("text/")
        or "json" in ct
        or "markdown" in ct
        or "csv" in ct
        or not ct
        or ct == "application/octet-stream"
    ):
        as_text = data.decode("utf-8", errors="replace").strip()
        if as_text and not looks_like_extract_garbage(as_text):
            return as_text[:200_000]

    raise RuntimeError(
        f"Cannot extract text from {content_type or 'upload'}. "
        "Upload a .txt/.md rubric, or a text-extractable PDF."
    )


async def normalize_rubric_text(raw_text: str, source_name: str) -> dict[str, Any]:
    if looks_like_extract_garbage(raw_text):
        raise RuntimeError(
            "Rubric text extraction failed (empty or unreadable). "
            "Re-upload a text PDF, .txt, or .md."
        )
    clipped = raw_text[:80_000]
    declared = declared_total_from_text(raw_text)
    hint = (
        f"\nThe document states a total of {declared} points — totalMaxPoints must be {declared}."
        if declared
        else ""
    )
    out = await chat_complete(
        system=SYSTEM,
        user=f"Source name: {source_name}{hint}\n\nRubric document:\n{clipped}",
        temperature=0.05,
    )
    parsed = extract_json_object(out)
    cats = parsed.get("categories") or []
    if not cats:
        raise RuntimeError("Normalized rubric missing categories")
    total = 0
    for cat in cats:
        levels = cat.get("levels") or []
        if not levels:
            raise RuntimeError(f"Category {cat.get('name')} has no levels")
        max_from_levels = max(int(l.get("points") or 0) for l in levels)
        cat["maxPoints"] = int(cat.get("maxPoints") or max_from_levels)
        total += cat["maxPoints"]
    if declared is not None:
        parsed["totalMaxPoints"] = declared
    else:
        parsed["totalMaxPoints"] = int(parsed.get("totalMaxPoints") or total)
    parsed["sourceName"] = parsed.get("sourceName") or source_name
    if not matrix_grounded_in_source(parsed, raw_text):
        raise RuntimeError(
            "Normalized categories do not match the rubric text "
            "(model likely invented criteria). Retry the judge run."
        )
    return parsed
