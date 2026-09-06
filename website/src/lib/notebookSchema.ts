import type {
  EntryMetadata,
  Identified,
  NotebookMetadata,
  ProjectPhase,
  TeamMember,
  TeamMetadata,
} from "./metadata";
import { validateEntry } from "./metadata";
import { NOTEBOOK_VERSION } from "./constants";
import { generateUUID } from "./utils";

export function sortedByOrder<T extends { order: number }>(
  dict: Record<string, T> | undefined | null
): Identified<T>[] {
  return Object.entries(dict || {})
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));
}

export function sortedEntries(entries: Record<string, EntryMetadata> | undefined): Identified<EntryMetadata>[] {
  return sortedByOrder(entries);
}

export function sortedMembers(members: Record<string, TeamMember> | undefined): Identified<TeamMember>[] {
  return sortedByOrder(members);
}

export function sortedPhases(phases: Record<string, ProjectPhase> | undefined): Identified<ProjectPhase>[] {
  return sortedByOrder(phases);
}

export function withEntryId(id: string, entry: EntryMetadata): Identified<EntryMetadata> {
  return { id, ...entry };
}

export function recordFromIdentified<T extends { order?: number }>(
  items: Identified<T>[]
): Record<string, Omit<T, never>> {
  const result: Record<string, T> = {};
  items.forEach((item, i) => {
    const { id, ...rest } = item;
    result[id] = { ...rest, order: i } as unknown as T;
  });
  return result;
}

function densifyOrder<T extends { order: number }>(dict: Record<string, T>): Record<string, T> {
  const sorted = sortedByOrder(dict);
  const next: Record<string, T> = {};
  sorted.forEach((item, i) => {
    const { id, ...rest } = item;
    next[id] = { ...(rest as unknown as T), order: i };
  });
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Parse `authors` arrays or a legacy comma-separated `author` string. */
export function parseAuthors(value: unknown, fallback?: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => asString(v).trim()).filter(Boolean);
  }
  const raw = asString(value) || asString(fallback);
  if (!raw.trim()) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function formatAuthors(authors: string[] | undefined | null): string {
  return (authors || []).map((s) => s.trim()).filter(Boolean).join(", ");
}

export function authorsEqual(a?: string[] | null, b?: string[] | null): boolean {
  const aa = a || [];
  const bb = b || [];
  return aa.length === bb.length && aa.every((name, i) => name === bb[i]);
}

function dropId<T extends Record<string, unknown>>(obj: T): Omit<T, "id" | "index"> {
  const rest = { ...obj };
  delete rest.id;
  delete rest.index;
  return rest;
}

function migratePhases(raw: unknown): { phases: Record<string, ProjectPhase>; indexToKey: Map<number, string> } {
  const indexToKey = new Map<number, string>();
  const phases: Record<string, ProjectPhase> = {};

  if (Array.isArray(raw)) {
    raw.forEach((item, i) => {
      if (!isRecord(item)) return;
      const id = asString(item.id) || generateUUID();
      const legacyIndex = asNumber(item.index, i + 1);
      indexToKey.set(legacyIndex, id);
      phases[id] = {
        name: asString(item.name),
        description: asString(item.description),
        iconName: asString(item.iconName, "HelpCircle"),
        color: asString(item.color, "#747775"),
        order: asNumber(item.order, i),
      };
    });
  } else if (isRecord(raw)) {
    for (const [id, item] of Object.entries(raw)) {
      if (!isRecord(item)) continue;
      const key = asString(item.id) || id;
      const legacyIndex = typeof item.index === "number" ? item.index : undefined;
      if (legacyIndex !== undefined) indexToKey.set(legacyIndex, key);
      phases[key] = {
        name: asString(item.name),
        description: asString(item.description),
        iconName: asString(item.iconName, "HelpCircle"),
        color: asString(item.color, "#747775"),
        order: asNumber(item.order, Object.keys(phases).length),
      };
    }
  }

  return { phases: densifyOrder(phases), indexToKey };
}

function migrateMembers(raw: unknown): Record<string, TeamMember> {
  const members: Record<string, TeamMember> = {};
  if (Array.isArray(raw)) {
    raw.forEach((item, i) => {
      if (!isRecord(item)) return;
      const id = asString(item.id) || generateUUID();
      members[id] = {
        name: asString(item.name),
        role: asString(item.role),
        order: asNumber(item.order, i),
        ...(item.image ? { image: asString(item.image) } : {}),
        ...(item.imageOriginal ? { imageOriginal: asString(item.imageOriginal) } : {}),
      };
    });
  } else if (isRecord(raw)) {
    for (const [id, item] of Object.entries(raw)) {
      if (!isRecord(item)) continue;
      members[id] = {
        name: asString(item.name),
        role: asString(item.role),
        order: asNumber(item.order, Object.keys(members).length),
        ...(item.image ? { image: asString(item.image) } : {}),
        ...(item.imageOriginal ? { imageOriginal: asString(item.imageOriginal) } : {}),
      };
    }
  }
  return densifyOrder(members);
}

function migrateEntries(
  raw: unknown,
  indexToKey: Map<number, string>
): Record<string, EntryMetadata> {
  const entries: Record<string, { entry: EntryMetadata; sortDate: string; sortUpdated: string }> = {};
  const push = (id: string, item: Record<string, unknown>, fallbackOrder: number) => {
    let phase: string | null = null;
    if (typeof item.phase === "string" && item.phase) phase = item.phase;
    else if (typeof item.phase === "number") phase = indexToKey.get(item.phase) ?? null;

    entries[id] = {
      sortDate: asString(item.date),
      sortUpdated: asString(item.updatedAt) || asString(item.createdAt),
      entry: {
        title: asString(item.title),
        authors: parseAuthors(item.authors, item.author),
        phase,
        createdAt: asString(item.createdAt),
        updatedAt: asString(item.updatedAt) || asString(item.createdAt),
        date: asString(item.date),
        filename: asString(item.filename, `data/entries/${id}.json`),
        order: asNumber(item.order, fallbackOrder),
        ...(item.isTemplate ? { isTemplate: true } : {}),
        resources: isRecord(item.resources)
          ? (item.resources as EntryMetadata["resources"])
          : {},
        references: Array.isArray(item.references) ? item.references.map(String) : [],
        assets: Array.isArray(item.assets) ? item.assets.map(String) : [],
      },
    };
  };

  if (Array.isArray(raw)) {
    raw.forEach((item, i) => {
      if (!isRecord(item)) return;
      const id = asString(item.id) || generateUUID();
      push(id, item, i);
    });
  } else if (isRecord(raw)) {
    Object.entries(raw).forEach(([key, item], i) => {
      if (!isRecord(item)) return;
      const id = asString(item.id) || key;
      push(id, item, i);
    });
  }

  const hasExplicitOrder = Object.values(entries).some((e) => typeof (e.entry as EntryMetadata).order === "number");
  const sortedIds = Object.keys(entries).sort((a, b) => {
    const ea = entries[a];
    const eb = entries[b];
    if (hasExplicitOrder && ea.entry.order !== eb.entry.order) return ea.entry.order - eb.entry.order;
    const dateComp = ea.sortDate.localeCompare(eb.sortDate);
    if (dateComp !== 0) return dateComp;
    const timeComp = ea.sortUpdated.localeCompare(eb.sortUpdated);
    if (timeComp !== 0) return timeComp;
    return a.localeCompare(b);
  });

  const result: Record<string, EntryMetadata> = {};
  sortedIds.forEach((id, i) => {
    result[id] = { ...entries[id].entry, order: i };
  });
  return result;
}

function compareDatedEntries(
  a: Identified<EntryMetadata>,
  b: Identified<EntryMetadata>
): number {
  const aDated = !!a.date;
  const bDated = !!b.date;
  if (aDated !== bDated) return aDated ? -1 : 1;
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if (a.order !== b.order) return a.order - b.order;
  const created = (a.createdAt || "").localeCompare(b.createdAt || "");
  if (created !== 0) return created;
  return a.id.localeCompare(b.id);
}

/** Templates occupy 0..k-1. Dated entries follow in date order; same day keeps drag/`order`, then createdAt. */
export function packTemplatesToFront(
  entries: Record<string, EntryMetadata>
): Record<string, EntryMetadata> {
  const sorted = sortedEntries(entries);
  const packed = [
    ...sorted.filter((e) => e.isTemplate),
    ...sorted.filter((e) => !e.isTemplate).sort(compareDatedEntries),
  ];
  const result: Record<string, EntryMetadata> = {};
  packed.forEach((item, i) => {
    const { id, ...entry } = item;
    result[id] = { ...entry, order: i };
  });
  return result;
}

function canonicalMember(m: TeamMember): TeamMember {
  return {
    name: m.name || "",
    role: m.role || "",
    order: m.order,
    ...(m.image ? { image: m.image } : {}),
    ...(m.imageOriginal ? { imageOriginal: m.imageOriginal } : {}),
  };
}

function canonicalPhase(p: ProjectPhase): ProjectPhase {
  return {
    name: p.name || "",
    description: p.description || "",
    iconName: p.iconName || "HelpCircle",
    color: p.color || "#747775",
    order: p.order,
  };
}

function canonicalEntry(e: EntryMetadata): EntryMetadata {
  const resources = e.resources || {};
  const canonicalResources: Record<string, { title: string; caption: string; type: string }> = {};
  for (const id of Object.keys(resources).sort()) {
    const r = resources[id];
    canonicalResources[id] = { type: r.type || "", title: r.title || "", caption: r.caption || "" };
  }
  return {
    title: e.title || "",
    authors: parseAuthors(e.authors),
    phase: e.phase ?? null,
    createdAt: e.createdAt || "",
    updatedAt: e.updatedAt || "",
    date: e.date || "",
    filename: e.filename || "",
    order: e.order,
    ...(e.isTemplate ? { isTemplate: true } : {}),
    resources: canonicalResources,
    references: e.references || [],
    assets: e.assets || [],
    ...(e.isValid !== undefined ? { isValid: e.isValid } : {}),
    ...(e.validationErrors ? { validationErrors: e.validationErrors } : {}),
  };
}

function canonicalTeam(team: TeamMetadata | undefined): TeamMetadata | undefined {
  if (!team) return undefined;
  const members: Record<string, TeamMember> = {};
  for (const item of sortedMembers(team.members)) {
    const { id, ...rest } = item;
    members[id] = canonicalMember(rest);
  }
  return {
    teamName: team.teamName || "",
    teamNumber: team.teamNumber || "",
    startDate: team.startDate || "",
    endDate: team.endDate || "",
    autoCalculateDates: team.autoCalculateDates ?? true,
    organization: team.organization || "",
    ...(team.logo ? { logo: team.logo } : {}),
    ...(team.logoOriginal ? { logoOriginal: team.logoOriginal } : {}),
    members,
  };
}

/** Structural migrate + dense order + assetRefs + per-entry validity. */
export function normalizeNotebookMetadata(raw: unknown): NotebookMetadata {
  const source = isRecord(raw) ? raw : {};
  const { phases, indexToKey } = migratePhases(source.phases);
  const teamRaw = isRecord(source.team) ? source.team : {};
  const team = canonicalTeam({
    teamName: asString(teamRaw.teamName),
    teamNumber: asString(teamRaw.teamNumber),
    startDate: asString(teamRaw.startDate),
    endDate: asString(teamRaw.endDate),
    autoCalculateDates: asBool(teamRaw.autoCalculateDates, true),
    organization: asString(teamRaw.organization),
    ...(teamRaw.logo ? { logo: asString(teamRaw.logo) } : {}),
    ...(teamRaw.logoOriginal ? { logoOriginal: asString(teamRaw.logoOriginal) } : {}),
    members: migrateMembers(teamRaw.members),
  });

  const entries = packTemplatesToFront(migrateEntries(source.entries, indexToKey));

  const assetRefs: Record<string, string[]> = {};
  const trackAsset = (path: string, owner: string) => {
    if (!path || path.startsWith("data:")) return;
    if (!assetRefs[path]) assetRefs[path] = [];
    if (!assetRefs[path].includes(owner)) assetRefs[path].push(owner);
  };

  if (team?.logo) trackAsset(team.logo, "team");
  if (team?.logoOriginal) trackAsset(team.logoOriginal, "team");
  for (const [memberId, member] of Object.entries(team?.members || {})) {
    if (member.image) trackAsset(member.image, "team");
    if (member.imageOriginal) trackAsset(member.imageOriginal, "team");
    void memberId;
  }

  const existingIds = new Set<string>();
  for (const [entryId, entry] of Object.entries(entries)) {
    existingIds.add(entryId);
    if (entry.resources) {
      for (const resId of Object.keys(entry.resources)) existingIds.add(resId);
    }
    (entry.assets || []).forEach((a) => trackAsset(a, entryId));
  }

  const phaseList = sortedPhases(phases);
  const nextEntries: Record<string, EntryMetadata> = {};
  for (const { id, ...entry } of sortedEntries(entries)) {
    const errors = validateEntry(entry, phaseList, existingIds);
    nextEntries[id] = canonicalEntry({
      ...entry,
      isValid: errors.length === 0,
      validationErrors: errors,
    });
  }

  const canonicalPhases: Record<string, ProjectPhase> = {};
  for (const { id, ...p } of phaseList) {
    canonicalPhases[id] = canonicalPhase(p);
  }

  const result: NotebookMetadata = {
    version: NOTEBOOK_VERSION,
    entries: nextEntries,
    ...(team ? { team } : {}),
    phases: canonicalPhases,
    assetRefs,
    ...(typeof source.lastCompiled === "string" && source.lastCompiled
      ? { lastCompiled: source.lastCompiled }
      : {}),
  };
  return result;
}

export function serializeNotebookMetadata(metadata: NotebookMetadata): string {
  return JSON.stringify(normalizeNotebookMetadata(metadata), null, 2);
}

export function isNotebookValid(metadata: NotebookMetadata): boolean {
  return sortedEntries(metadata.entries).every((e) => e.isValid !== false);
}

/**
 * Reorder entries while optionally changing dates.
 * `orderedIds` is the new global order. `dateById` overlays date changes (empty string = undated).
 */
export function reorderEntries(
  metadata: NotebookMetadata,
  orderedIds: string[],
  dateById?: Record<string, string>
): NotebookMetadata {
  const entries: Record<string, EntryMetadata> = { ...metadata.entries };
  const seen = new Set<string>();
  orderedIds.forEach((id, i) => {
    if (!entries[id]) return;
    seen.add(id);
    entries[id] = {
      ...entries[id],
      order: i,
      ...(dateById && id in dateById ? { date: dateById[id] } : {}),
    };
  });
  Object.keys(entries).forEach((id) => {
    if (!seen.has(id)) {
      entries[id] = { ...entries[id], order: orderedIds.length + entries[id].order };
    }
  });
  return normalizeNotebookMetadata({ ...metadata, entries });
}

/** Place `movedId` into `dayIds` at `toIndex` (that day's list), updating date + global order. */
export function moveEntryOnCalendar(
  metadata: NotebookMetadata,
  movedId: string,
  targetDate: string,
  dayIdsBeforeMove: string[],
  toIndex: number
): NotebookMetadata {
  const without = dayIdsBeforeMove.filter((id) => id !== movedId);
  const insertAt = Math.max(0, Math.min(toIndex, without.length));
  without.splice(insertAt, 0, movedId);

  const dateById: Record<string, string> = { [movedId]: targetDate };
  const templates = sortedEntries(metadata.entries).filter((e) => e.isTemplate).map((e) => e.id);
  const dated = sortedEntries(metadata.entries)
    .filter((e) => !e.isTemplate && e.id !== movedId)
    .map((e) => ({ ...e, date: dateById[e.id] ?? e.date }));

  const before = dated.filter((e) => !!e.date && e.date < targetDate).map((e) => e.id);
  const after = dated.filter((e) => !e.date || e.date > targetDate).map((e) => e.id);
  const sameDayOthers = dated.filter((e) => e.date === targetDate).map((e) => e.id);
  const dayOrder = without.filter((id) => id === movedId || sameDayOthers.includes(id));
  for (const id of sameDayOthers) {
    if (!dayOrder.includes(id)) dayOrder.push(id);
  }

  return reorderEntries(metadata, [...templates, ...before, ...dayOrder, ...after], dateById);
}

/** Index in `sorted` (excluding the new item) to insert a dated non-template. */
export function insertionIndexForDatedEntry(
  sorted: Identified<EntryMetadata>[],
  date: string
): number {
  let lastOnOrBefore = -1;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (e.isTemplate || !e.date) continue;
    if (e.date <= date) lastOnOrBefore = i;
  }
  if (lastOnOrBefore !== -1) return lastOnOrBefore + 1;
  const firstFuture = sorted.findIndex((e) => !e.isTemplate && !!e.date && e.date > date);
  return firstFuture === -1 ? sorted.length : firstFuture;
}

export function insertionIndexForTemplate(sorted: Identified<EntryMetadata>[]): number {
  const firstTemplate = sorted.findIndex((e) => e.isTemplate);
  return firstTemplate === -1 ? 0 : firstTemplate;
}

/** After adding `id` to `metadata.entries`, densify global order (date for entries, front of templates for templates). */
export function placeCreatedEntry(metadata: NotebookMetadata, id: string): NotebookMetadata {
  const created = metadata.entries[id];
  if (!created) return metadata;
  const without = sortedEntries(metadata.entries).filter((e) => e.id !== id);
  const at = created.isTemplate
    ? insertionIndexForTemplate(without)
    : insertionIndexForDatedEntry(without, created.date || "");
  const ids = without.map((e) => e.id);
  ids.splice(at, 0, id);
  return reorderEntries(metadata, ids);
}

/** Replace the template subsequence in global order. `templateIds` is ascending-order (sortedEntries) sequence. */
export function reorderTemplateSequence(
  metadata: NotebookMetadata,
  templateIds: string[]
): NotebookMetadata {
  const wanted = templateIds.filter((id) => metadata.entries[id]?.isTemplate);
  if (wanted.length === 0) return metadata;
  let i = 0;
  const ids = sortedEntries(metadata.entries).map((e) => {
    if (!e.isTemplate) return e.id;
    return wanted[i++] ?? e.id;
  });
  return reorderEntries(metadata, ids);
}

function withoutOrder<T extends { order: number }>(item: T): string {
  const rest = { ...item };
  delete (rest as { order?: number }).order;
  return JSON.stringify(rest);
}

export function mergeOrderKeys(
  base: Record<string, { order: number }> | undefined,
  local: Record<string, { order: number }> | undefined,
  remote: Record<string, { order: number }> | undefined,
  survivingIds: Set<string>
): string[] {
  const ids = (d?: Record<string, { order: number }>) =>
    Object.entries(d || {})
      .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
      .map(([id]) => id)
      .filter((id) => survivingIds.has(id));

  const b = ids(base);
  const l = ids(local);
  const r = ids(remote);
  const same = (a: string[], c: string[]) => a.length === c.length && a.every((x, i) => x === c[i]);

  if (same(l, b)) return [...r, ...l.filter((id) => !r.includes(id))];
  if (same(r, b)) return [...l, ...r.filter((id) => !l.includes(id))];
  return [...l, ...r.filter((id) => !l.includes(id))];
}

export function mergeRecordById<T extends { order: number }>(
  base: Record<string, T> | undefined,
  local: Record<string, T> | undefined,
  remote: Record<string, T> | undefined,
  collidingIds?: string[]
): Record<string, T> {
  const bDict = base || {};
  const lDict = local || {};
  const rDict = remote || {};
  const allIds = new Set([...Object.keys(bDict), ...Object.keys(lDict), ...Object.keys(rDict)]);
  const merged: Record<string, T> = {};

  for (const id of allIds) {
    const b = bDict[id];
    const l = lDict[id];
    const r = rDict[id];
    if (!b && l && !r) { merged[id] = l; continue; }
    if (!b && !l && r) { merged[id] = r; continue; }
    if (b && !l && r && JSON.stringify(b) === JSON.stringify(r)) continue;
    if (b && l && !r && JSON.stringify(b) === JSON.stringify(l)) continue;
    if (b && l && r && JSON.stringify(b) !== JSON.stringify(l) && JSON.stringify(b) === JSON.stringify(r)) {
      merged[id] = l; continue;
    }
    if (b && l && r && JSON.stringify(b) === JSON.stringify(l) && JSON.stringify(b) !== JSON.stringify(r)) {
      merged[id] = r; continue;
    }
    if (l && r && withoutOrder(l) !== withoutOrder(r) && withoutOrder(l) !== withoutOrder(b || l) && withoutOrder(r) !== withoutOrder(b || r)) {
      collidingIds?.push(id);
      merged[id] = l;
      continue;
    }
    if (l) merged[id] = l;
    else if (r) merged[id] = r;
  }

  const ordered = mergeOrderKeys(base, local, remote, new Set(Object.keys(merged)));
  const result: Record<string, T> = {};
  ordered.forEach((id, i) => {
    if (merged[id]) result[id] = { ...merged[id], order: i };
  });
  Object.keys(merged).forEach((id) => {
    if (!(id in result)) result[id] = merged[id];
  });
  return result;
}

export { dropId };
