import { describe, expect, it } from "vitest";
import {
  canonicalResourceOwner,
  carryForwardResourceIds,
  duplicateResourceOwners,
  remapContentIds,
  remapSelectedContentIds,
  type EntryMetadata,
  type TipTapNode,
} from "@/lib/metadata";

const heading = (id: string, text: string): TipTapNode => ({
  type: "heading",
  attrs: { id, level: 1 },
  content: [{ type: "text", text }],
});

describe("remapContentIds", () => {
  it("never reuses reserved resource ids", () => {
    const reserved = new Set(["keep-me", "also-keep"]);
    const { doc, idMap } = remapContentIds(
      { type: "doc", content: [heading("keep-me", "Develop Solution")] },
      new Map(),
      reserved
    );
    const newId = (doc as TipTapNode).content?.[0]?.attrs?.id as string;
    expect(newId).not.toBe("keep-me");
    expect(newId).not.toBe("also-keep");
    expect(idMap.get("keep-me")).toBe(newId);
  });
});

describe("duplicate resource owners", () => {
  const entries: Record<string, EntryMetadata> = {
    live: {
      title: "Develop Solution",
      authors: ["Ada"],
      phase: "develop-solution",
      date: "2026-05-11",
      createdAt: "",
      updatedAt: "",
      filename: "live.json",
      order: 0,
      isTemplate: false,
      resources: {
        "019e2f01-4cf8-7e23-804c-1e8968f3de13": { type: "heading", title: "Develop Solution", caption: "Develop Solution" },
      },
    },
    template: {
      title: "Develop Solution Template",
      authors: [],
      phase: "develop-solution",
      date: "",
      createdAt: "",
      updatedAt: "",
      filename: "tmpl.json",
      order: 1,
      isTemplate: true,
      resources: {
        "019e2f01-4cf8-7e23-804c-1e8968f3de13": { type: "heading", title: "Develop Solution", caption: "Develop Solution" },
      },
    },
  };

  it("detects shared resource ids and prefers the non-template owner", () => {
    const dupes = duplicateResourceOwners(entries);
    expect([...dupes.keys()]).toEqual(["019e2f01-4cf8-7e23-804c-1e8968f3de13"]);
    expect(canonicalResourceOwner(dupes.get("019e2f01-4cf8-7e23-804c-1e8968f3de13")!, entries)).toBe("live");
  });

  it("remaps only the colliding ids in template content", () => {
    const reserved = new Set(["019e2f01-4cf8-7e23-804c-1e8968f3de13", "live", "template"]);
    const { doc, idMap } = remapSelectedContentIds(
      { type: "doc", content: [heading("019e2f01-4cf8-7e23-804c-1e8968f3de13", "Develop Solution")] },
      new Set(["019e2f01-4cf8-7e23-804c-1e8968f3de13"]),
      reserved
    );
    const newId = (doc as TipTapNode).content?.[0]?.attrs?.id as string;
    expect(newId).not.toBe("019e2f01-4cf8-7e23-804c-1e8968f3de13");
    expect(idMap.get("019e2f01-4cf8-7e23-804c-1e8968f3de13")).toBe(newId);
  });
});

describe("carryForwardResourceIds", () => {
  it("restores ids lost on matching heading and table slots", () => {
    const previous: TipTapNode = {
      type: "doc",
      content: [
        heading("019e2ee1-e249-7193-b019-ff994f7740bd", "Generate Concepts"),
        { type: "table", attrs: { id: "019e481d-f9a7-73b6-9333-d759fcc0d061", title: "Decision Matrix" } },
      ],
    };
    const next: TipTapNode = {
      type: "doc",
      content: [
        heading("", "Generate Concepts"),
        { type: "table", attrs: { title: "Decision Matrix" } },
      ],
    };
    delete next.content![0].attrs!.id;
    carryForwardResourceIds(next, previous);
    expect(next.content?.[0]?.attrs?.id).toBe("019e2ee1-e249-7193-b019-ff994f7740bd");
    expect(next.content?.[1]?.attrs?.id).toBe("019e481d-f9a7-73b6-9333-d759fcc0d061");
  });
});
