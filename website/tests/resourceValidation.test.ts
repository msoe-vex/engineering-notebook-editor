import { describe, expect, it } from "vitest";
import { extractResources, validateEntry, type TipTapNode } from "@/lib/notebook/metadata";

describe("resource index vs entry body", () => {
  it("extractResources surfaces images with empty captions so validateEntry fails", () => {
    const doc: TipTapNode = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            id: "img-1",
            title: "Figure",
            caption: "",
            src: "data/assets/compressed/abc.jpg",
            filePath: "data/assets/compressed/abc.jpg",
          },
        },
      ],
    };

    const resources = extractResources(doc);
    expect(resources["img-1"]).toMatchObject({ title: "Figure", caption: "", type: "image" });

    const errors = validateEntry(
      {
        title: "Entry",
        authors: ["Ada"],
        phase: "define",
        date: "2026-09-01",
        createdAt: "",
        updatedAt: "",
        filename: "data/entries/e1.json",
        order: 0,
        resources,
      },
      { define: { name: "Define", description: "", iconName: "Goal", color: "#000", order: 0 } },
      new Set(["img-1"])
    );

    expect(errors.some((e) => /caption missing/i.test(e))).toBe(true);
  });

  it("does not report caption errors when the resource is absent from metadata", () => {
    // This is the old broken state — body has the image, notebook.json does not list it.
    const errors = validateEntry(
      {
        title: "Entry",
        authors: ["Ada"],
        phase: "define",
        date: "2026-09-01",
        createdAt: "",
        updatedAt: "",
        filename: "data/entries/e1.json",
        order: 0,
        resources: {},
      },
      { define: { name: "Define", description: "", iconName: "Goal", color: "#000", order: 0 } },
      new Set()
    );

    expect(errors.some((e) => /caption missing/i.test(e))).toBe(false);
  });
});
