/** Metadata-only validation (no TipTap resources/refs). Used by Core revalidation. */
export type EntryMetaForValidation = {
    title?: string;
    authors?: string[];
    date?: string;
    phase?: string | null;
    isTemplate?: boolean;
};
export declare function isMetadataValidationMessage(message: string): boolean;
/**
 * Validate title / authors / date / phase against notebook phases.
 * Does not check resource titles, captions, or broken references.
 */
export declare function validateEntryMetadataFields(entry: EntryMetaForValidation, phases: Record<string, unknown> | string[] | null | undefined): string[];
/** Replace metadata-field errors; keep resource/reference errors from a prior pass. */
export declare function mergeMetadataValidationErrors(previousErrors: string[] | undefined, metaErrors: string[]): {
    validationErrors: string[];
    isValid: boolean;
};
