import type { EntryMetadata, NotebookAccess, NotebookExport, NotebookFolder, NotebookMember, NotebookSummary, ProjectPhase } from "./types.js";
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
    members: Record<string, {
        name: string;
        role: string;
        order: number;
        imageAssetId?: string;
        imageOriginalAssetId?: string;
    }>;
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
export declare function migrateEntryV4ToV5(entry: EntryMetadataV4): EntryMetadata;
export declare function migrateNotebookV4ToV5(raw: NotebookMetadataV4, orgId: string, name: string): {
    summary: NotebookSummary;
    entries: Record<string, EntryMetadata>;
    members: Record<string, Omit<NotebookMember, "id">>;
};
export declare function buildExportV5(summary: NotebookSummary, entries: Record<string, EntryMetadata>, members?: Record<string, Omit<NotebookMember, "id">>): NotebookExport;
/** Accept v4 or current index JSON and return current export metadata + entries. */
export declare function normalizeImportNotebook(raw: Record<string, unknown>, orgId: string, fallbackName: string): {
    summary: NotebookSummary;
    entries: Record<string, EntryMetadata>;
    members: Record<string, Omit<NotebookMember, "id">>;
};
export {};
