import { describe, expect, it } from "vitest";
import { mergeNotebookMetadata } from "@/lib/notebook/metadata";
import {
  moveEntryOnCalendar,
  normalizeNotebookMetadata,
  placeCreatedEntry,
  reorderTemplateSequence,
  sortedEntries,
} from "@/lib/notebook/notebookSchema";

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
    expect(normalized.entries["e-1"].authors).toEqual(["Ada"]);
    expect(keys.slice(0, 4)).toEqual(["title", "authors", "phase", "createdAt"]);
  });

  it("migrates a comma-separated author string into authors", () => {
    const normalized = normalizeNotebookMetadata({
      version: 4,
      entries: {
        e: { title: "E", author: "Ada, Grace", phase: null, date: "2026-09-01", createdAt: "", updatedAt: "", filename: "e", order: 0, isTemplate: false },
      },
      phases: {},
      team: { teamName: "", teamNumber: "", organization: "", members: {} },
    });
    expect(normalized.entries.e.authors).toEqual(["Ada", "Grace"]);
    expect(normalized.entries.e).not.toHaveProperty("author");
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

  it("moves an entry to an earlier empty date and updates global order", () => {
    const next = moveEntryOnCalendar(base, "c", "2026-08-01", [], 0);
    expect(next.entries.c.date).toBe("2026-08-01");
    expect(sortedEntries(next.entries).map((e) => e.id)).toEqual(["c", "a", "b"]);
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

describe("packTemplatesToFront", () => {
  it("moves templates ahead of dated entries without shuffling either group", () => {
    const normalized = normalizeNotebookMetadata({
      version: 4,
      entries: {
        t1: { title: "T1", author: "", phase: null, date: "", createdAt: "", updatedAt: "", filename: "t1", order: 0, isTemplate: true },
        e1: { title: "E1", author: "x", phase: null, date: "2026-09-01", createdAt: "", updatedAt: "", filename: "e1", order: 1, isTemplate: false },
        t2: { title: "T2", author: "", phase: null, date: "", createdAt: "", updatedAt: "", filename: "t2", order: 2, isTemplate: true },
        e2: { title: "E2", author: "x", phase: null, date: "2026-09-02", createdAt: "", updatedAt: "", filename: "e2", order: 3, isTemplate: false },
      },
      phases: {},
      team: { teamName: "", teamNumber: "", organization: "", members: {} },
    });
    expect(sortedEntries(normalized.entries).map((e) => e.id)).toEqual(["t1", "t2", "e1", "e2"]);
    expect(sortedEntries(normalized.entries).map((e) => e.order)).toEqual([0, 1, 2, 3]);
  });

  it("repacks dated entries into chronological order and keeps same-day order", () => {
    const normalized = normalizeNotebookMetadata({
      version: 4,
      entries: {
        t: { title: "T", author: "", phase: null, date: "", createdAt: "", updatedAt: "", filename: "t", order: 0, isTemplate: true },
        later: { title: "Later", author: "x", phase: null, date: "2026-09-10", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "", filename: "l", order: 1, isTemplate: false },
        earlier: { title: "Earlier", author: "x", phase: null, date: "2026-09-01", createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "", filename: "e", order: 2, isTemplate: false },
        sameB: { title: "B", author: "x", phase: null, date: "2026-09-01", createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "", filename: "b", order: 3, isTemplate: false },
      },
      phases: {},
      team: { teamName: "", teamNumber: "", organization: "", members: {} },
    });
    expect(sortedEntries(normalized.entries).map((e) => e.id)).toEqual(["t", "earlier", "sameB", "later"]);
  });
});

describe("placeCreatedEntry", () => {
  it("inserts a today entry before future-dated entries", () => {
    const withFuture = normalizeNotebookMetadata({
      version: 4,
      entries: {
        t: { title: "T", author: "", phase: null, date: "", createdAt: "", updatedAt: "", filename: "t", order: 0, isTemplate: true },
        past: { title: "Past", author: "x", phase: null, date: "2026-01-01", createdAt: "", updatedAt: "", filename: "p", order: 1, isTemplate: false },
        future: { title: "Future", author: "x", phase: null, date: "2026-12-01", createdAt: "", updatedAt: "", filename: "f", order: 2, isTemplate: false },
        today: { title: "Today", author: "x", phase: null, date: "2026-09-05", createdAt: "", updatedAt: "", filename: "n", order: 3, isTemplate: false },
      },
      phases: {},
      team: { teamName: "", teamNumber: "", organization: "", members: {} },
    });
    const placed = placeCreatedEntry(withFuture, "today");
    expect(sortedEntries(placed.entries).map((e) => e.id)).toEqual(["t", "past", "today", "future"]);
  });

  it("inserts a new template at the front of existing templates", () => {
    const withEntries = normalizeNotebookMetadata({
      version: 4,
      entries: {
        t1: { title: "T1", author: "", phase: null, date: "", createdAt: "", updatedAt: "", filename: "t1", order: 0, isTemplate: true },
        e: { title: "E", author: "x", phase: null, date: "2026-09-05", createdAt: "", updatedAt: "", filename: "e", order: 1, isTemplate: false },
        t2: { title: "T2", author: "", phase: null, date: "", createdAt: "", updatedAt: "", filename: "t2", order: 2, isTemplate: true },
      },
      phases: {},
      team: { teamName: "", teamNumber: "", organization: "", members: {} },
    });
    const placed = placeCreatedEntry(withEntries, "t2");
    expect(sortedEntries(placed.entries).map((e) => e.id)).toEqual(["t2", "t1", "e"]);
  });

  it("writes auto team start/end from dated entries", () => {
    const normalized = normalizeNotebookMetadata({
      version: 4,
      entries: {
        t: { title: "T", author: "", phase: null, date: "", createdAt: "", updatedAt: "", filename: "t", order: 0, isTemplate: true },
        a: { title: "A", author: "x", phase: null, date: "2026-09-02", createdAt: "", updatedAt: "", filename: "a", order: 1 },
        b: { title: "B", author: "x", phase: null, date: "2026-11-18", createdAt: "", updatedAt: "", filename: "b", order: 2 },
      },
      phases: {},
      team: { teamName: "Robo", teamNumber: "1", organization: "", members: {}, startDate: "January 2020", endDate: "February 2020" },
    });
    expect(normalized.team?.startDate).toBe("September 2026");
    expect(normalized.team?.endDate).toBe("November 2026");
  });

  it("keeps custom team dates when auto-calculate is off", () => {
    const normalized = normalizeNotebookMetadata({
      version: 4,
      entries: {
        a: { title: "A", author: "x", phase: null, date: "2026-09-02", createdAt: "", updatedAt: "", filename: "a", order: 0 },
      },
      phases: {},
      team: {
        teamName: "Robo",
        teamNumber: "1",
        organization: "",
        members: {},
        autoCalculateDates: false,
        startDate: "August 2025",
        endDate: "May 2026",
      },
    });
    expect(normalized.team?.startDate).toBe("August 2025");
    expect(normalized.team?.endDate).toBe("May 2026");
  });
});

describe("reorderTemplateSequence", () => {
  it("permutes templates without moving dated entries", () => {
    const base = normalizeNotebookMetadata({
      version: 4,
      entries: {
        t1: { title: "T1", author: "", phase: null, date: "", createdAt: "", updatedAt: "", filename: "t1", order: 0, isTemplate: true },
        e: { title: "E", author: "x", phase: null, date: "2026-09-05", createdAt: "", updatedAt: "", filename: "e", order: 1, isTemplate: false },
        t2: { title: "T2", author: "", phase: null, date: "", createdAt: "", updatedAt: "", filename: "t2", order: 2, isTemplate: true },
      },
      phases: {},
      team: { teamName: "", teamNumber: "", organization: "", members: {} },
    });
    const next = reorderTemplateSequence(base, ["t2", "t1"]);
    expect(sortedEntries(next.entries).map((e) => e.id)).toEqual(["t2", "t1", "e"]);
  });
});
