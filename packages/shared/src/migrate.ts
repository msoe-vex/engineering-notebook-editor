import { NOTEBOOK_SCHEMA_VERSION } from "./types.js";
import type {
  EntryMetadataV5,
  NotebookExportV5,
  NotebookFolder,
  NotebookSummaryV5,
  ProjectPhase,
  TeamMetadataV5,
} from "./types.js";

/** Minimal v4 shapes used only for import migrate-once. */
type EntryMetadataV4 = {
  title: string;
  authors: string[];
  phase: string | null;
  createdAt: string;
  updatedAt: string;
  date: string;
  filename?: string;
  order: number;
  isTemplate?: boolean;
  resources?: Record<string, { title: string; caption: string; type: string }>;
  isValid?: boolean;
  references?: string[];
  assets?: string[];
  validationErrors?: string[];
  folderId?: string | null;
};

type NotebookMetadataV4 = {
  version: number;
  entries: Record<string, EntryMetadataV4>;
  team?: TeamMetadataV5 & { logo?: string; logoOriginal?: string };
  phases?: Record<string, ProjectPhase>;
  lastCompiled?: string;
  folders?: Record<string, NotebookFolder>;
};

function assetPathsToIds(paths: string[] | undefined): string[] | undefined {
  if (!paths?.length) return undefined;
  return paths.map((p) => {
    const base = p.split("/").pop() ?? p;
    return base.replace(/\.[^.]+$/, "") || base;
  });
}

export function migrateEntryV4ToV5(entry: EntryMetadataV4): EntryMetadataV5 {
  const { filename: _filename, assets, ...rest } = entry;
  return {
    title: rest.title,
    authors: rest.authors ?? [],
    phase: rest.phase,
    createdAt: rest.createdAt,
    updatedAt: rest.updatedAt,
    date: rest.date,
    folderId: rest.folderId ?? null,
    order: rest.order ?? 0,
    isTemplate: rest.isTemplate,
    resources: rest.resources,
    isValid: rest.isValid,
    references: rest.references,
    assetIds: assetPathsToIds(assets),
    validationErrors: rest.validationErrors,
  };
}

export function migrateNotebookV4ToV5(
  raw: NotebookMetadataV4,
  orgId: string,
  name: string
): { summary: NotebookSummaryV5; entries: Record<string, EntryMetadataV5> } {
  const entries: Record<string, EntryMetadataV5> = {};
  for (const [id, entry] of Object.entries(raw.entries ?? {})) {
    entries[id] = migrateEntryV4ToV5(entry);
  }

  const team = raw.team
    ? {
        ...raw.team,
        logoAssetId: raw.team.logoAssetId,
        logoOriginalAssetId: raw.team.logoOriginalAssetId,
      }
    : undefined;

  const summary: NotebookSummaryV5 = {
    schemaVersion: NOTEBOOK_SCHEMA_VERSION,
    orgId,
    name,
    folders: raw.folders ?? {},
    team,
    phases: raw.phases ?? {},
    lastCompiled: raw.lastCompiled,
    updatedAt: new Date().toISOString(),
  };

  return { summary, entries };
}

export function buildExportV5(
  summary: NotebookSummaryV5,
  entries: Record<string, EntryMetadataV5>
): NotebookExportV5 {
  return {
    schemaVersion: NOTEBOOK_SCHEMA_VERSION,
    name: summary.name,
    folders: summary.folders,
    team: summary.team,
    phases: summary.phases,
    lastCompiled: summary.lastCompiled,
    entries,
  };
}

/** Accept v4 or v5 index JSON and always return v5 export metadata + entries. */
export function normalizeImportNotebook(
  raw: Record<string, unknown>,
  orgId: string,
  fallbackName: string
): { summary: NotebookSummaryV5; entries: Record<string, EntryMetadataV5> } {
  const version = Number(raw.version ?? raw.schemaVersion ?? 4);
  if (version >= 5) {
    const summary = raw as unknown as NotebookSummaryV5;
    return {
      summary: {
        ...summary,
        schemaVersion: NOTEBOOK_SCHEMA_VERSION,
        orgId: summary.orgId || orgId,
        name: summary.name || fallbackName,
        folders: summary.folders ?? {},
      },
      entries: (raw.entries as Record<string, EntryMetadataV5>) ?? {},
    };
  }
  return migrateNotebookV4ToV5(raw as unknown as NotebookMetadataV4, orgId, fallbackName);
}
