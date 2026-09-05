import { describe, expect, it } from "vitest";
import { mergeNotebookMetadata } from "@/lib/metadata";
import {
  moveEntryOnCalendar,
  normalizeNotebookMetadata,
  sortedEntries,
} from "@/lib/notebookSchema";

describe("normalizeNotebookMetadata", () => {
  it("migrates v3 dict entries, member arrays, and numeric phases", () => {
    const normalized = normalizeNotebookMetadata({
      version: 3,
      entries: {
        "e-1": {
          id: "e-1",
          title: "Kickoff",
          author: "Ada",
          phase: 1,
          date: "2026-09-02",
          createdAt: "2026-09-02T00:00:00.000Z",
          updatedAt: "2026-09-02T00:00:00.000Z",
          filename: "data/entries/e-1.json",
        },
        "e-2": {
          id: "e-2",
          title: "Follow-up",
          author: "Ada",
          phase: 1,
          date: "2026-09-02",
          createdAt: "2026-09-02T01:00:00.000Z",
          updatedAt: "2026-09-02T01:00:00.000Z",
          filename: "data/entries/e-2.json",
        },
      },
      team: {
        teamName: "Robo",
        teamNumber: "1",
        organization: "MSOE",
        members: [{ id: "m-1", name: "Ada", role: "Lead" }],
      },
      phases: [
        { id: "define-problem", index: 1, name: "Define Problem", description: "", iconName: "Goal", color: "#3b82f6" },
      ],
    });

    expect(normalized.version).toBe(4);
    expect(normalized.entries["e-1"]).not.toHaveProperty("id");
    expect(normalized.entries["e-1"].phase).toBe("define-problem");
    expect(normalized.entries["e-1"].order).toBe(0);
    expect(normalized.entries["e-2"].order).toBe(1);
    expect(normalized.team?.members["m-1"]).toMatchObject({ name: "Ada", order: 0 });
    expect(normalized.phases?.["define-problem"].order).toBe(0);

    const keys = Object.keys(JSON.parse(JSON.stringify(normalized.entries["e-1"])));
    expect(keys.slice(0, 4)).toEqual(["title", "author", "phase", "createdAt"]);
  });

  it("densifies duplicate and gapped order values", () => {
    const normalized = normalizeNotebookMetadata({
      version: 4,
      entries: {
        a: { title: "A", author: "x", phase: null, date: "2026-01-01", createdAt: "", updatedAt: "", filename: "a", order: 10, isTemplate: true },
        b: { title: "B", author: "x", phase: null, date: "2026-01-02", createdAt: "", updatedAt: "", filename: "b", order: 10, isTemplate: true },
      },
      phases: {},
      team: { teamName: "", teamNumber: "", organization: "", members: {} },
    });
    const orders = sortedEntries(normalized.entries).map((e) => e.order);
    expect(orders).toEqual([0, 1]);
  });
});

describe("calendar reorder", () => {
  const base = normalizeNotebookMetadata({
    version: 4,
    entries: {
      a: { title: "A", author: "x", phase: null, date: "2026-09-01", createdAt: "", updatedAt: "", filename: "a", order: 0, isTemplate: false },
      b: { title: "B", author: "x", phase: null, date: "2026-09-01", createdAt: "", updatedAt: "", filename: "b", order: 1, isTemplate: false },
      c: { title: "C", author: "x", phase: null, date: "2026-09-02", createdAt: "", updatedAt: "", filename: "c", order: 2, isTemplate: false },
    },
    phases: {},
    team: { teamName: "", teamNumber: "", organization: "", members: {} },
  });

  it("reorders within the same day", () => {
    const next = moveEntryOnCalendar(base, "a", "2026-09-01", ["a", "b"], 1);
    expect(sortedEntries(next.entries).filter((e) => e.date === "2026-09-01").map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("moves an entry to another day", () => {
    const next = moveEntryOnCalendar(base, "a", "2026-09-02", ["c"], 0);
    expect(next.entries.a.date).toBe("2026-09-02");
    expect(sortedEntries(next.entries).filter((e) => e.date === "2026-09-02").map((e) => e.id)).toEqual(["a", "c"]);
  });
});

describe("mergeNotebookMetadata", () => {
  it("keeps local content on collision and merges remote-only order ids", () => {
    const base = normalizeNotebookMetadata({
      version: 4,
      entries: {
        a: { title: "A", author: "x", phase: null, date: "2026-09-01", createdAt: "", updatedAt: "", filename: "a", order: 0, isTemplate: true },
      },
      phases: {},
      team: { teamName: "", teamNumber: "", organization: "", members: {} },
    });
    const local = normalizeNotebookMetadata({
      ...base,
      entries: {
        a: { ...base.entries.a, title: "Local" },
        b: { title: "B", author: "x", phase: null, date: "2026-09-02", createdAt: "", updatedAt: "", filename: "b", order: 1, isTemplate: true },
      },
    });
    const remote = normalizeNotebookMetadata({
      ...base,
      entries: {
        a: { ...base.entries.a, title: "Remote" },
        c: { title: "C", author: "x", phase: null, date: "2026-09-03", createdAt: "", updatedAt: "", filename: "c", order: 1, isTemplate: true },
      },
    });
    const { merged, collidingEntryIds } = mergeNotebookMetadata(base, local, remote);
    expect(collidingEntryIds).toContain("a");
    expect(merged.entries.a.title).toBe("Local");
    expect(Object.keys(merged.entries).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("sortedEntries", () => {
  it("includes derived ids", () => {
    const normalized = normalizeNotebookMetadata({
      version: 4,
      entries: {
        zed: { title: "Z", author: "", phase: null, date: "", createdAt: "", updatedAt: "", filename: "z", order: 0, isTemplate: true },
      },
      phases: {},
      team: { teamName: "", teamNumber: "", organization: "", members: {} },
    });
    expect(sortedEntries(normalized.entries)[0].id).toBe("zed");
  });
});
