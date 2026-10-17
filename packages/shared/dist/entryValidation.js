/** Metadata-only validation (no TipTap resources/refs). Used by Core revalidation. */
const META_MESSAGES = {
    title: "Entry title is required.",
    author: "Author name is required.",
    date: "Date is required.",
    phase: "Entry phase is required.",
};
export function isMetadataValidationMessage(message) {
    return Object.values(META_MESSAGES).includes(message);
}
/**
 * Validate title / authors / date / phase against notebook phases.
 * Does not check resource titles, captions, or broken references.
 */
export function validateEntryMetadataFields(entry, phases) {
    const errors = [];
    const ids = new Set(Array.isArray(phases) ? phases : Object.keys(phases || {}));
    if (!entry.title?.trim())
        errors.push(META_MESSAGES.title);
    if (!entry.isTemplate) {
        if (!entry.authors?.some((name) => name.trim()))
            errors.push(META_MESSAGES.author);
        if (!entry.date?.trim())
            errors.push(META_MESSAGES.date);
        if (ids.size > 0 && (!entry.phase || !ids.has(entry.phase))) {
            errors.push(META_MESSAGES.phase);
        }
    }
    return errors;
}
/** Replace metadata-field errors; keep resource/reference errors from a prior pass. */
export function mergeMetadataValidationErrors(previousErrors, metaErrors) {
    const kept = (previousErrors || []).filter((e) => !isMetadataValidationMessage(e));
    const validationErrors = [...metaErrors, ...kept];
    return { validationErrors, isValid: validationErrors.length === 0 };
}
