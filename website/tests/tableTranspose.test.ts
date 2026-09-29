import { describe, expect, it } from "vitest";
import { transposeCellGrid, type CellSnapshot } from "@/components/editor/nodes/TableNodeView";

function cell(text: string, type = "tableCell"): CellSnapshot {
  return {
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : undefined }],
  };
}

function texts(grid: CellSnapshot[][]): string[][] {
  return grid.map((row) =>
    row.map((c) => {
      const para = (c.content as { content?: { text?: string }[] }[])?.[0];
      return para?.content?.[0]?.text ?? "";
    })
  );
}

describe("transposeCellGrid", () => {
  it("swaps a rectangular grid", () => {
    const grid = [
      [cell("A", "tableHeader"), cell("B", "tableHeader"), cell("C", "tableHeader")],
      [cell("1"), cell("2"), cell("3")],
      [cell("4"), cell("5"), cell("6")],
    ];
    const out = transposeCellGrid(grid);
    expect(texts(out)).toEqual([
      ["A", "1", "4"],
      ["B", "2", "5"],
      ["C", "3", "6"],
    ]);
    // Header types move with their cells (header row → header column)
    expect(out.map((r) => r[0].type)).toEqual(["tableHeader", "tableHeader", "tableHeader"]);
  });

  it("pads missing cells in jagged rows", () => {
    const grid = [
      [cell("A"), cell("B")],
      [cell("C")],
    ];
    const out = transposeCellGrid(grid);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(2);
    expect(out[1]).toHaveLength(2);
    expect(texts(out)[0][0]).toBe("A");
    expect(texts(out)[1][0]).toBe("B");
    expect(texts(out)[0][1]).toBe("C");
    expect(texts(out)[1][1]).toBe("");
  });

  it("is its own inverse for rectangular grids", () => {
    const grid = [
      [cell("A"), cell("B")],
      [cell("C"), cell("D")],
      [cell("E"), cell("F")],
    ];
    expect(texts(transposeCellGrid(transposeCellGrid(grid)))).toEqual(texts(grid));
  });
});
