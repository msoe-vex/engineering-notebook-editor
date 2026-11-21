import { NOTEBOOK_SCHEMA_VERSION, defaultNotebookAccess } from "./types.js";
import type {
  EntryMetadata,
  NotebookAccess,
  NotebookExport,
  NotebookFolder,
  NotebookMember,
  NotebookSummary,
  ProjectPhase,
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

/** Embedded team blob that existed on v4 notebook index JSON. */
type TeamMetadataV4 = {
  teamName: string;
  teamNumber: string;
  startDate?: string;
  endDate?: string;
  autoCalculateDates?: boolean;
  organization: string;
  logoAssetId?: string;
  logoOriginalAssetId?: string;
  logo?: string;
  logoOriginal?: string;
  members: Record<
    string,
    {
      name: string;
      role: string;
      order: number;
      imageAssetId?: string;
      imageOriginalAssetId?: string;
    }
  >;
};

type NotebookMetadataV4 = {
  version: number;
  entries: Record<string, EntryMetadataV4>;
  team?: TeamMetadataV4;
  phases?: Record<string, ProjectPhase>;
  folders?: Record<string, NotebookFolder>;
  title?: string;
  subtitle?: string;
  logoAssetId?: string;
  access?: NotebookAccess;
  members?: Record<string, Omit<NotebookMember, "id">>;
};

function assetPathsToIds(paths: string[] | undefined): string[] | undefined {
  if (!paths?.length) return undefined;
  return paths.map((p) => {
    const base = p.split("/").pop() ?? p;
    return base.replace(/\.[^.]+$/, "") || base;
  });
}

export function migrateEntryV4ToV5(entry: EntryMetadataV4): EntryMetadata {
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
    // Local v4 `order` was compile/calendar sequence; explorer starts aligned with it.
    explorerOrder: rest.order ?? 0,
    isTemplate: rest.isTemplate,
    resources: rest.resources,
    isValid: rest.isValid,
    references: rest.references,
    assetIds: assetPathsToIds(assets),
    validationErrors: rest.validationErrors,
  };
}

/** Map v4 embedded `team` into notebook branding + member map. */
function liftTeamFromV4(team: TeamMetadataV4 | undefined): {
  title?: string;
  subtitle?: string;
  logoAssetId?: string;
  members: Record<string, Omit<NotebookMember, "id">>;
} {
  if (!team) return { members: {} };
  const members: Record<string, Omit<NotebookMember, "id">> = {};
  for (const [id, m] of Object.entries(team.members ?? {})) {
    members[id] = {
      name: m.name,
      role: m.role,
      order: m.order,
      imageAssetId: m.imageAssetId,
    };
  }
  return {
    title: team.teamName || undefined,
    subtitle: [team.teamNumber, team.organization].filter(Boolean).join(" · ") || undefined,
    logoAssetId: team.logoAssetId,
    members,
  };
}

export function migrateNotebookV4ToV5(
  raw: NotebookMetadataV4,
  orgId: string,
  name: string
): {
  summary: NotebookSummary;
  entries: Record<string, EntryMetadata>;
  members: Record<string, Omit<NotebookMember, "id">>;
} {
  const entries: Record<string, EntryMetadata> = {};
  for (const [id, entry] of Object.entries(raw.entries ?? {})) {
    entries[id] = migrateEntryV4ToV5(entry);
  }

  const lifted = liftTeamFromV4(raw.team);
  const members = raw.members ?? lifted.members;

  const summary: NotebookSummary = {
    schemaVersion: NOTEBOOK_SCHEMA_VERSION,
    orgId,
    name,
    title: raw.title ?? lifted.title,
    subtitle: raw.subtitle ?? lifted.subtitle,
    logoAssetId: raw.logoAssetId ?? lifted.logoAssetId,
    folders: raw.folders ?? {},
    access: raw.access ?? defaultNotebookAccess(),
    phases: raw.phases ?? {},
    updatedAt: new Date().toISOString(),
  };

  return { summary, entries, members };
}

export function buildExportV5(
  summary: NotebookSummary,
  entries: Record<string, EntryMetadata>,
  members?: Record<string, Omit<NotebookMember, "id">>
): NotebookExport {
  return {
    schemaVersion: NOTEBOOK_SCHEMA_VERSION,
    name: summary.name,
    title: summary.title,
    subtitle: summary.subtitle,
    logoAssetId: summary.logoAssetId,
    folders: summary.folders,
    access: summary.access ?? defaultNotebookAccess(),
    phases: summary.phases,
    members,
    entries,
  };
}

/** Accept v4 or current index JSON and return current export metadata + entries. */
export function normalizeImportNotebook(
  raw: Record<string, unknown>,
  orgId: string,
  fallbackName: string
): {
  summary: NotebookSummary;
  entries: Record<string, EntryMetadata>;
  members: Record<string, Omit<NotebookMember, "id">>;
} {
  const version = Number(raw.version ?? raw.schemaVersion ?? 4);
  if (version >= 5) {
    const summary = raw as unknown as NotebookSummary;
    return {
      summary: {
        ...summary,
        schemaVersion: NOTEBOOK_SCHEMA_VERSION,
        orgId: summary.orgId || orgId,
        name: summary.name || fallbackName,
        folders: summary.folders ?? {},
        access: summary.access ?? defaultNotebookAccess(),
        phases: summary.phases ?? {},
      },
      entries: (raw.entries as Record<string, EntryMetadata>) ?? {},
      members: (raw.members as Record<string, Omit<NotebookMember, "id">> | undefined) ?? {},
    };
  }
  return migrateNotebookV4ToV5(raw as unknown as NotebookMetadataV4, orgId, fallbackName);
}
