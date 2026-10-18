/** TipTap / notebook types needed for LaTeX generation (subset of website metadata). */

export type Identified<T> = T & { id: string };

export interface EntryMetadata {
  title: string;
  authors: string[];
  phase: string | null;
  createdAt: string;
  updatedAt: string;
  date: string;
  filename: string;
  order: number;
  isTemplate?: boolean;
  assets?: string[];
  deletedAt?: string | null;
}

export interface TeamMember {
  name: string;
  role: string;
  order: number;
  image?: string;
  imageOriginal?: string;
}

export interface TeamMetadata {
  teamName: string;
  teamNumber: string;
  startDate?: string;
  endDate?: string;
  organization: string;
  logo?: string;
  logoOriginal?: string;
  members: Record<string, TeamMember>;
}

export interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: TipTapMark[];
  text?: string;
}

export interface ProjectPhase {
  name: string;
  description: string;
  iconName: string;
  color: string;
  order: number;
}

export function sortedByOrder<T extends { order: number }>(
  dict: Record<string, T> | undefined | null
): Identified<T>[] {
  return Object.entries(dict || {})
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function sortedEntries(
  entries: Record<string, EntryMetadata> | undefined
): Identified<EntryMetadata>[] {
  return sortedByOrder(entries);
}

export function sortedMembers(
  members: Record<string, TeamMember> | undefined
): Identified<TeamMember>[] {
  return sortedByOrder(members);
}

export function sortedPhases(
  phases: Record<string, ProjectPhase> | undefined
): Identified<ProjectPhase>[] {
  return sortedByOrder(phases);
}

export function formatAuthors(authors: string[] | undefined | null): string {
  return [...(authors || [])]
    .map((s) => s.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .join(", ");
}

/** Compile order: calendar date → same-day order → id (templates / trash excluded). */
export function sortedForCompile(
  entries: Record<string, EntryMetadata>
): Identified<EntryMetadata>[] {
  return Object.entries(entries)
    .filter(([, e]) => !e.isTemplate && !e.deletedAt)
    .map(([id, value]) => ({ id, ...value }))
    .sort(
      (a, b) =>
        (a.date || "").localeCompare(b.date || "") ||
        (a.order ?? 0) - (b.order ?? 0) ||
        a.id.localeCompare(b.id)
    );
}
