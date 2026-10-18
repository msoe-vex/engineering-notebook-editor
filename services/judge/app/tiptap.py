from __future__ import annotations

from typing import Any


def tip_tap_to_plain(doc: Any) -> str:
    if not isinstance(doc, dict):
        return ""
    parts: list[str] = []

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        text = node.get("text")
        if isinstance(text, str):
            parts.append(text)
        content = node.get("content")
        if isinstance(content, list):
            for child in content:
                walk(child)

    walk(doc)
    return " ".join(parts).replace("\n", " ")
