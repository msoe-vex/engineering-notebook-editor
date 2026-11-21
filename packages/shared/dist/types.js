export const NOTEBOOK_SCHEMA_VERSION = 5;
/** Section enabled on the public site? Default true. */
export function isPublicSection(page, key) {
    return page?.sections?.[key] !== false;
}
/** Whether a catalog/member record appears on the public site. Default true. */
export function isPublicRecord(doc) {
    return doc?.public !== false;
}
/**
 * Record is visible publicly when the section is on and the item is public.
 * Default both true.
 */
export function isListedOnPublicSite(page, section, doc) {
    return isPublicSection(page, section) && isPublicRecord(doc);
}
export function defaultNotebookAccess() {
    return { mode: "org", teamIds: [], userIds: [] };
}
