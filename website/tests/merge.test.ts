import { describe, expect, it } from "vitest";
import {
  isNotebookValid,
  mergeNotebookMetadata,
  mergeProjectPhases,
  mergeTeamMetadata,
  normalizeNotebookMetadata,
  sortedEntries,
  sortedMembers,
  sortedPhases,
  type EntryMetadata,
  type ProjectPhase,
  type TeamMember,
  type TeamMetadata,
} from "@/lib/notebook/metadata";
import { mergeOrderKeys, mergeRecordById } from "@/lib/notebook/notebookSchema";

type Item = { title: string; order: number };

function item(title: string, order: number): Item {
  return { title, order };
}

function dict(pairs: [string, Item][]): Record<string, Item> {
  return Object.fromEntries(pairs);
}

function entry(partial: Partial<EntryMetadata> & { title: string }): EntryMetadata {
  return {
    authors: ["x"],
    phase: null,
    date: "2026-09-01",
    createdAt: "",
    updatedAt: "",
    filename: `${partial.title}.json`,
    order: 0,
    isTemplate: true,
    ...partial,
  };
}

function notebook(entries: Record<string, Partial<EntryMetadata> & { title: string }>, extras?: {
  team?: TeamMetadata;
  phases?: Record<string, ProjectPhase>;
}) {
  const mapped: Record<string, EntryMetadata> = {};
  for (const [id, e] of Object.entries(entries)) mapped[id] = entry(e);
  return normalizeNotebookMetadata({
    version: 4,
    entries: mapped,
    phases: extras?.phases ?? {},
    team: extras?.team ?? { teamName: "", teamNumber: "", organization: "", members: {} },
  });
}

function member(name: string, order: number, extra?: Partial<TeamMember>): TeamMember {
  return { name, role: "Lead", order, ...extra };
}

function team(partial?: Partial<TeamMetadata>): TeamMetadata {
  return {
    teamName: "Robo",
    teamNumber: "1",
    organization: "MSOE",
    autoCalculateDates: true,
    members: {},
    ...partial,
  };
}

function phase(name: string, order: number): ProjectPhase {
  return { name, description: "", iconName: "Goal", color: "#3b82f6", order };
}

describe("mergeRecordById", () => {
  const base = dict([["a", item("A", 0)]]);

  it("keeps a local-only add", () => {
    const merged = mergeRecordById(base, dict([["a", item("A", 0)], ["b", item("B", 1)]]), base);
    expect(Object.keys(merged).sort()).toEqual(["a", "b"]);
    expect(merged.b.title).toBe("B");
  });

  it("keeps a remote-only add", () => {
    const merged = mergeRecordById(base, base, dict([["a", item("A", 0)], ["c", item("C", 1)]]));
    expect(Object.keys(merged).sort()).toEqual(["a", "c"]);
  });

  it("keeps both sides' unique adds", () => {
    const local = dict([["a", item("A", 0)], ["b", item("B", 1)]]);
    const remote = dict([["a", item("A", 0)], ["c", item("C", 1)]]);
    const merged = mergeRecordById(base, local, remote);
    expect(Object.keys(merged).sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps the local edit when remote is unchanged", () => {
    const local = dict([["a", item("Local", 0)]]);
    const merged = mergeRecordById(base, local, base);
    expect(merged.a.title).toBe("Local");
  });

  it("keeps the remote edit when local is unchanged", () => {
    const remote = dict([["a", item("Remote", 0)]]);
    const merged = mergeRecordById(base, base, remote);
    expect(merged.a.title).toBe("Remote");
  });

  it("records a collision and keeps local when both edited content", () => {
    const collisions: string[] = [];
    const merged = mergeRecordById(
      base,
      dict([["a", item("Local", 0)]]),
      dict([["a", item("Remote", 0)]]),
      collisions
    );
    expect(collisions).toEqual(["a"]);
    expect(merged.a.title).toBe("Local");
  });

  it("does not treat order-only divergence as a content collision", () => {
    const collisions: string[] = [];
    const local = dict([["a", item("A", 0)], ["b", item("B", 1)]]);
    const remote = dict([["b", item("B", 0)], ["a", item("A", 1)]]);
    const baseTwo = dict([["a", item("A", 0)], ["b", item("B", 1)]]);
    const merged = mergeRecordById(baseTwo, local, remote, collisions);
    expect(collisions).toEqual([]);
    expect(merged.a.title).toBe("A");
    expect(merged.b.title).toBe("B");
  });

  it("drops an id when remote deleted it and local matches base", () => {
    const merged = mergeRecordById(base, base, {});
    expect(merged).toEqual({});
  });

  it("drops an id when local deleted it and remote matches base", () => {
    const merged = mergeRecordById(base, {}, base);
    expect(merged).toEqual({});
  });

  it("keeps a local edit when remote deleted the same id", () => {
    const merged = mergeRecordById(base, dict([["a", item("Local", 0)]]), {});
    expect(merged.a.title).toBe("Local");
  });

  it("keeps a remote edit when local deleted the same id", () => {
    const merged = mergeRecordById(base, {}, dict([["a", item("Remote", 0)]]));
    expect(merged.a.title).toBe("Remote");
  });
});

describe("mergeOrderKeys", () => {
  const base = dict([["a", item("A", 0)], ["b", item("B", 1)]]);
  const ids = new Set(["a", "b", "c"]);

  it("takes remote order when local matches base", () => {
    const remote = dict([["b", item("B", 0)], ["a", item("A", 1)], ["c", item("C", 2)]]);
    expect(mergeOrderKeys(base, base, remote, ids)).toEqual(["b", "a", "c"]);
  });

  it("takes local order when remote matches base", () => {
    const local = dict([["b", item("B", 0)], ["a", item("A", 1)]]);
    expect(mergeOrderKeys(base, local, base, ids)).toEqual(["b", "a"]);
  });

  it("prefers local order and appends remote-only ids when both reordered", () => {
    const local = dict([["b", item("B", 0)], ["a", item("A", 1)]]);
    const remote = dict([["a", item("A", 0)], ["c", item("C", 1)], ["b", item("B", 2)]]);
    expect(mergeOrderKeys(base, local, remote, ids)).toEqual(["b", "a", "c"]);
  });
});

describe("mergeNotebookMetadata", () => {
  const base = notebook({
    a: { title: "A", order: 0 },
  });

  it("merges unique adds and keeps local on colliding titles", () => {
    const local = notebook({
      a: { title: "Local", order: 0 },
      b: { title: "B", order: 1 },
    });
    const remote = notebook({
      a: { title: "Remote", order: 0 },
      c: { title: "C", order: 1 },
    });
    const { merged, hasCollisions, collidingEntryIds } = mergeNotebookMetadata(base, local, remote);
    expect(hasCollisions).toBe(true);
    expect(collidingEntryIds).toEqual(["a"]);
    expect(merged.entries.a.title).toBe("Local");
    expect(sortedEntries(merged.entries).map((e) => e.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("applies local reorder and appends a remote-only entry", () => {
    const withTwo = notebook({
      a: { title: "A", order: 0 },
      b: { title: "B", order: 1 },
    });
    const local = notebook({
      b: { title: "B", order: 0 },
      a: { title: "A", order: 1 },
    });
    const remote = notebook({
      a: { title: "A", order: 0 },
      b: { title: "B", order: 1 },
      c: { title: "C", order: 2 },
    });
    const { merged, hasCollisions } = mergeNotebookMetadata(withTwo, local, remote);
    expect(hasCollisions).toBe(false);
    expect(sortedEntries(merged.entries).map((e) => e.id)).toEqual(["b", "a", "c"]);
  });

  it("marks the notebook invalid when a non-template entry is missing required fields", () => {
    const invalid = notebook({
      a: { title: "", authors: [], phase: null, date: "", isTemplate: false, order: 0 },
    });
    expect(isNotebookValid(invalid)).toBe(false);
  });
});

describe("mergeTeamMetadata", () => {
  const base = team({
    members: { m1: member("Ada", 0) },
  });

  it("takes local field edits and remote field edits independently", () => {
    const local = team({ teamName: "Local", members: base.members });
    const remote = team({ teamNumber: "99", members: base.members });
    const merged = mergeTeamMetadata(base, local, remote);
    expect(merged?.teamName).toBe("Local");
    expect(merged?.teamNumber).toBe("99");
    expect(merged?.organization).toBe("MSOE");
  });

  it("merges members with local-wins collisions", () => {
    const local = team({
      members: { m1: member("Ada Local", 0), m2: member("Bob", 1) },
    });
    const remote = team({
      members: { m1: member("Ada Remote", 0), m3: member("Cara", 1) },
    });
    const merged = mergeTeamMetadata(base, local, remote);
    const names = sortedMembers(merged?.members).map((m) => `${m.id}:${m.name}`);
    expect(names).toEqual(["m1:Ada Local", "m2:Bob", "m3:Cara"]);
  });

  it("drops a member deleted on remote when local matches base", () => {
    const remote = team({ members: {} });
    const merged = mergeTeamMetadata(base, base, remote);
    expect(merged?.members).toEqual({});
  });
});

describe("mergeProjectPhases", () => {
  const base = { define: phase("Define", 0) };

  it("keeps unique adds from both sides", () => {
    const local = { define: phase("Define", 0), develop: phase("Develop", 1) };
    const remote = { define: phase("Define", 0), test: phase("Test", 1) };
    const merged = mergeProjectPhases(base, local, remote);
    expect(sortedPhases(merged).map((p) => p.id).sort()).toEqual(["define", "develop", "test"]);
  });

  it("keeps local phase edits on collision", () => {
    const local = { define: phase("Define Local", 0) };
    const remote = { define: phase("Define Remote", 0) };
    const merged = mergeProjectPhases(base, local, remote);
    expect(merged?.define.name).toBe("Define Local");
  });
});
