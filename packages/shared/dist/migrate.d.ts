import type { EntryMetadataV5, NotebookExportV5, NotebookFolder, NotebookSummaryV5, ProjectPhase, TeamMetadataV5 } from "./types.js";
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
    team?: TeamMetadataV5 & {
        logo?: string;
        logoOriginal?: string;
    };
    phases?: Record<string, ProjectPhase>;
    lastCompiled?: string;
    folders?: Record<string, NotebookFolder>;
};
export declare function migrateEntryV4ToV5(entry: EntryMetadataV4): EntryMetadataV5;
export declare function migrateNotebookV4ToV5(raw: NotebookMetadataV4, orgId: string, name: string): {
    summary: NotebookSummaryV5;
    entries: Record<string, EntryMetadataV5>;
};
export declare function buildExportV5(summary: NotebookSummaryV5, entries: Record<string, EntryMetadataV5>): NotebookExportV5;
/** Accept v4 or v5 index JSON and always return v5 export metadata + entries. */
export declare function normalizeImportNotebook(raw: Record<string, unknown>, orgId: string, fallbackName: string): {
    summary: NotebookSummaryV5;
    entries: Record<string, EntryMetadataV5>;
};
export {};
