from __future__ import annotations

import json
import re
from typing import Any

from app.core_client import ai_complete

_llm_ctx: dict[str, Any] = {"inference": "byok", "byok": None}


def set_llm_context(inference: str, byok: dict[str, str] | None) -> None:
    _llm_ctx["inference"] = inference or "byok"
    _llm_ctx["byok"] = byok


def get_llm_context() -> dict[str, Any]:
    return dict(_llm_ctx)


async def chat_complete(
    *, system: str | None = None, user: str, temperature: float = 0.2
) -> str:
    prompt = f"System:\n{system}\n\nUser:\n{user}" if system else user
    return await ai_complete(
        inference=str(_llm_ctx.get("inference") or "byok"),
        byok=_llm_ctx.get("byok"),
        prompt=prompt,
        temperature=temperature,
    )


def extract_json_object(text: str) -> Any:
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.I)
    raw = (fenced.group(1) if fenced else text).strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("No JSON object in model response")
    return json.loads(raw[start : end + 1])


def extract_json_array(text: str) -> list[Any]:
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.I)
    raw = (fenced.group(1) if fenced else text).strip()
    start = raw.find("[")
    end = raw.rfind("]")
    if start >= 0 and end > start:
        return json.loads(raw[start : end + 1])
    obj = extract_json_object(raw)
    if isinstance(obj, dict) and isinstance(obj.get("results"), list):
        return obj["results"]
    raise ValueError("No JSON array in model response")
