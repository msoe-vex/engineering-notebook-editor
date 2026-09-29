import { describe, expect, it } from "vitest";
import { ASSETS_COMPRESSED_DIR, ASSETS_ORIGINAL_DIR } from "@/lib/constants";
import { dehydrateAssets, extractImagePaths, type TipTapNode } from "@/lib/notebook/metadata";
import { hashContent } from "@/lib/utils";

const jpegB64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIWhwIB4gIh4gIjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z";
const dataUrl = `data:image/jpeg;base64,${jpegB64}`;

describe("extractImagePaths", () => {
  it("dedupes shared paths used by copy/pasted images", () => {
    const path = `${ASSETS_COMPRESSED_DIR}/abc.jpg`;
    const doc: TipTapNode = {
      type: "doc",
      content: [
        { type: "image", attrs: { src: dataUrl, filePath: path } },
        { type: "image", attrs: { src: dataUrl, filePath: path } },
      ],
    };
    expect(extractImagePaths(doc)).toEqual([path]);
  });

  it("keeps the shared path when one copy remains after deleting the other", () => {
    const path = `${ASSETS_COMPRESSED_DIR}/abc.jpg`;
    const afterDelete: TipTapNode = {
      type: "doc",
      content: [{ type: "image", attrs: { src: dataUrl, filePath: path } }],
    };
    expect(extractImagePaths(afterDelete)).toEqual([path]);
  });

  it("ignores bare data URLs without filePath (pre-dehydrate)", () => {
    const doc: TipTapNode = {
      type: "doc",
      content: [{ type: "image", attrs: { src: dataUrl } }],
    };
    expect(extractImagePaths(doc)).toEqual([]);
  });
});

describe("dehydrateAssets", () => {
  it("emits assets for data URLs even when the path was already known", async () => {
    const compressedHash = await hashContent(jpegB64);
    const knownPath = `${ASSETS_COMPRESSED_DIR}/${compressedHash}.jpg`;
    const doc: TipTapNode = {
      type: "doc",
      content: [{
        type: "image",
        attrs: {
          src: dataUrl,
          originalSrc: dataUrl,
          filePath: knownPath,
          originalFilePath: `${ASSETS_ORIGINAL_DIR}/${compressedHash}.jpg`,
        },
      }],
    };

    const { cleanDoc, newAssets } = await dehydrateAssets(doc, [knownPath]);

    expect(newAssets.some((a) => a.path === knownPath)).toBe(true);
    expect(extractImagePaths(cleanDoc)).toContain(knownPath);
  });

  it("assigns paths then extractImagePaths finds pasted data-only images", async () => {
    const doc: TipTapNode = {
      type: "doc",
      content: [
        { type: "image", attrs: { src: dataUrl, originalSrc: dataUrl } },
        { type: "image", attrs: { src: dataUrl, originalSrc: dataUrl } },
      ],
    };

    const { cleanDoc, newAssets } = await dehydrateAssets(doc, []);
    const paths = extractImagePaths(cleanDoc);

    expect(newAssets.length).toBeGreaterThan(0);
    expect(paths.length).toBeGreaterThan(0);
    // Both images share the same hashed path — deleting one copy must leave the path
    expect(paths).toEqual([...new Set(paths)]);
    for (const asset of newAssets) {
      expect(paths).toContain(asset.path);
    }
  });

  it("re-emits the same hashed path after a prior delete (replace-same-image)", async () => {
    const compressedHash = await hashContent(jpegB64);
    const path = `${ASSETS_COMPRESSED_DIR}/${compressedHash}.jpg`;
    const knownThenDeleted = [path];

    const replaced: TipTapNode = {
      type: "doc",
      content: [{
        type: "image",
        attrs: {
          src: dataUrl,
          originalSrc: dataUrl,
          filePath: path,
          originalFilePath: `${ASSETS_ORIGINAL_DIR}/${compressedHash}.jpg`,
        },
      }],
    };

    const { newAssets } = await dehydrateAssets(replaced, knownThenDeleted);
    expect(newAssets.find((a) => a.path === path)?.base64).toBe(jpegB64);
  });
});
