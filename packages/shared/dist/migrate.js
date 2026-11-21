import { NOTEBOOK_SCHEMA_VERSION, defaultNotebookAccess } from "./types.js";
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
function liftTeamFromV4(team) {
    if (!team)
        return { members: {} };
    const members = {};
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
export function migrateNotebookV4ToV5(raw, orgId, name) {
    const entries = {};
    for (const [id, entry] of Object.entries(raw.entries ?? {})) {
        entries[id] = migrateEntryV4ToV5(entry);
    }
    const lifted = liftTeamFromV4(raw.team);
    const members = raw.members ?? lifted.members;
    const summary = {
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
export function buildExportV5(summary, entries, members) {
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
                access: summary.access ?? defaultNotebookAccess(),
                phases: summary.phases ?? {},
            },
            entries: raw.entries ?? {},
            members: raw.members ?? {},
        };
    }
    return migrateNotebookV4ToV5(raw, orgId, fallbackName);
}
