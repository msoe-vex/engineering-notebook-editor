export const NOTEBOOK_SCHEMA_VERSION = 5;
export function defaultNotebookAccess() {
    return { mode: "org", teamIds: [], userIds: [] };
}
