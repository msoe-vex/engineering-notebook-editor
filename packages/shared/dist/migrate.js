import { NOTEBOOK_SCHEMA_VERSION } from "./types.js";
function assetPathsToIds(paths) {
    if (!paths?.length)
        return undefined;
    return paths.map((p) => {
        const base = p.split("/").pop() ?? p;
        return base.replace(/\.[^.]+$/, "") || base;
    });
}
export function migrateEntryV4ToV5(entry) {
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
export function migrateNotebookV4ToV5(raw, orgId, name) {
    const entries = {};
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
    const summary = {
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
export function buildExportV5(summary, entries) {
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
export function normalizeImportNotebook(raw, orgId, fallbackName) {
    const version = Number(raw.version ?? raw.schemaVersion ?? 4);
    if (version >= 5) {
        const summary = raw;
        return {
            summary: {
                ...summary,
                schemaVersion: NOTEBOOK_SCHEMA_VERSION,
                orgId: summary.orgId || orgId,
                name: summary.name || fallbackName,
                folders: summary.folders ?? {},
            },
            entries: raw.entries ?? {},
        };
    }
    return migrateNotebookV4ToV5(raw, orgId, fallbackName);
}
