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
        isTemplate: rest.isTemplate,
        resources: rest.resources,
        isValid: rest.isValid,
        references: rest.references,
        assetIds: assetPathsToIds(assets),
        validationErrors: rest.validationErrors,
    };
}
/** Lift legacy embedded team into notebook branding + member map (import shim). */
export function liftLegacyTeam(team) {
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
    const lifted = liftLegacyTeam(raw.team);
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
        lastCompiled: raw.lastCompiled,
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
        lastCompiled: summary.lastCompiled,
        entries,
    };
}
/** Accept v4 or v5 index JSON and always return current export metadata + entries. */
export function normalizeImportNotebook(raw, orgId, fallbackName) {
    const version = Number(raw.version ?? raw.schemaVersion ?? 4);
    if (version >= 5) {
        const legacyTeam = raw.team;
        const lifted = liftLegacyTeam(legacyTeam);
        const summary = raw;
        const members = raw.members ?? lifted.members;
        return {
            summary: {
                ...summary,
                schemaVersion: NOTEBOOK_SCHEMA_VERSION,
                orgId: summary.orgId || orgId,
                name: summary.name || fallbackName,
                title: summary.title ?? lifted.title,
                subtitle: summary.subtitle ?? lifted.subtitle,
                logoAssetId: summary.logoAssetId ?? lifted.logoAssetId,
                folders: summary.folders ?? {},
                access: summary.access ?? defaultNotebookAccess(),
                // Drop legacy embedded team from live summary
                phases: summary.phases ?? {},
            },
            entries: raw.entries ?? {},
            members,
        };
    }
    return migrateNotebookV4ToV5(raw, orgId, fallbackName);
}
