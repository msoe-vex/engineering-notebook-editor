import type { EntryMetadata, LegacyTeamMetadataV5, NotebookAccess, NotebookExport, NotebookFolder, NotebookMember, NotebookSummary, ProjectPhase } from "./types.js";
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
    resources?: Record<string, {
        title: string;
        caption: string;
        type: string;
    }>;
    isValid?: boolean;
    references?: string[];
    assets?: string[];
    validationErrors?: string[];
    folderId?: string | null;
};
type NotebookMetadataV4 = {
    version: number;
    entries: Record<string, EntryMetadataV4>;
    team?: LegacyTeamMetadataV5 & {
        logo?: string;
        logoOriginal?: string;
    };
    phases?: Record<string, ProjectPhase>;
    lastCompiled?: string;
    folders?: Record<string, NotebookFolder>;
    title?: string;
    subtitle?: string;
    logoAssetId?: string;
    access?: NotebookAccess;
    members?: Record<string, Omit<NotebookMember, "id">>;
};
export declare function migrateEntryV4ToV5(entry: EntryMetadataV4): EntryMetadata;
/** Lift legacy embedded team into notebook branding + member map (import shim). */
export declare function liftLegacyTeam(team: LegacyTeamMetadataV5 | undefined): {
    title?: string;
    subtitle?: string;
    logoAssetId?: string;
    members: Record<string, Omit<NotebookMember, "id">>;
};
export declare function migrateNotebookV4ToV5(raw: NotebookMetadataV4, orgId: string, name: string): {
    summary: NotebookSummary;
    entries: Record<string, EntryMetadata>;
    members: Record<string, Omit<NotebookMember, "id">>;
};
export declare function buildExportV5(summary: NotebookSummary, entries: Record<string, EntryMetadata>, members?: Record<string, Omit<NotebookMember, "id">>): NotebookExport;
/** Accept v4 or v5 index JSON and always return current export metadata + entries. */
export declare function normalizeImportNotebook(raw: Record<string, unknown>, orgId: string, fallbackName: string): {
    summary: NotebookSummary;
    entries: Record<string, EntryMetadata>;
    members: Record<string, Omit<NotebookMember, "id">>;
};
export {};
