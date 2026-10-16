import { describe, expect, it } from "vitest";
import { ASSETS_DIR } from "@/lib/constants";
import type { EntryMetadata, TeamMetadata, TipTapNode } from "@/lib/notebook/metadata";
import { collectImportAssetPaths } from "@/lib/store/transferManager";

function entry(partial: Partial<EntryMetadata> & { title: string }): EntryMetadata {
  return {
    authors: ["x"],
    phase: null,
    date: "2026-09-01",
    createdAt: "",
    updatedAt: "",
    filename: "data/entries/e.json",
    order: 0,
    ...partial,
  };
}

describe("collectImportAssetPaths", () => {
  it("returns no assets when entries are skipped and team is not imported", () => {
    expect([...collectImportAssetPaths({})]).toEqual([]);
  });

  it("keeps only team assets when entries are not imported", () => {
    const team: TeamMetadata = {
      teamName: "Robo",
      teamNumber: "1",
      organization: "MSOE",
      members: {
        m1: { name: "Alex", role: "Lead", order: 0, image: `${ASSETS_DIR}/compressed/member.jpg`, imageOriginal: `${ASSETS_DIR}/original/member.png` },
      },
      logo: `${ASSETS_DIR}/compressed/logo.jpg`,
      logoOriginal: `${ASSETS_DIR}/original/logo.png`,
    };

    expect([...collectImportAssetPaths({ team })].sort()).toEqual([
      `${ASSETS_DIR}/compressed/logo.jpg`,
      `${ASSETS_DIR}/compressed/member.jpg`,
      `${ASSETS_DIR}/original/logo.png`,
      `${ASSETS_DIR}/original/member.png`,
    ]);
  });

  it("keeps entry assets and image paths from content, ignoring orphan package assets", () => {
    const entries = {
      e1: entry({
        title: "Build",
        assets: [`${ASSETS_DIR}/compressed/used.jpg`, `${ASSETS_DIR}/original/used.png`],
      }),
    };
    const entryDocs: TipTapNode[] = [{
      type: "doc",
      content: [{
        type: "image",
        attrs: {
          filePath: `${ASSETS_DIR}/compressed/from-doc.jpg`,
          originalFilePath: `${ASSETS_DIR}/original/from-doc.png`,
        },
      }],
    }];

    const needed = collectImportAssetPaths({ entries, entryDocs });
    expect(needed.has(`${ASSETS_DIR}/compressed/used.jpg`)).toBe(true);
    expect(needed.has(`${ASSETS_DIR}/original/used.png`)).toBe(true);
    expect(needed.has(`${ASSETS_DIR}/compressed/from-doc.jpg`)).toBe(true);
    expect(needed.has(`${ASSETS_DIR}/original/from-doc.png`)).toBe(true);
    expect(needed.has(`${ASSETS_DIR}/compressed/orphan.jpg`)).toBe(false);
  });
});
