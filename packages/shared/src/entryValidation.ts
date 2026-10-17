/** Metadata-only validation (no TipTap resources/refs). Used by Core revalidation. */

export type EntryMetaForValidation = {
  title?: string;
  authors?: string[];
  date?: string;
  phase?: string | null;
  isTemplate?: boolean;
};

const META_MESSAGES = {
  title: "Entry title is required.",
  author: "Author name is required.",
  date: "Date is required.",
  phase: "Entry phase is required.",
} as const;

export function isMetadataValidationMessage(message: string): boolean {
  return (Object.values(META_MESSAGES) as string[]).includes(message);
}

/**
 * Validate title / authors / date / phase against notebook phases.
 * Does not check resource titles, captions, or broken references.
 */
export function validateEntryMetadataFields(
  entry: EntryMetaForValidation,
  phases: Record<string, unknown> | string[] | null | undefined
): string[] {
  const errors: string[] = [];
  const ids = new Set(Array.isArray(phases) ? phases : Object.keys(phases || {}));

  if (!entry.title?.trim()) errors.push(META_MESSAGES.title);

  if (!entry.isTemplate) {
    if (!entry.authors?.some((name) => name.trim())) errors.push(META_MESSAGES.author);
    if (!entry.date?.trim()) errors.push(META_MESSAGES.date);
    if (ids.size > 0 && (!entry.phase || !ids.has(entry.phase))) {
      errors.push(META_MESSAGES.phase);
    }
  }

  return errors;
}

/** Replace metadata-field errors; keep resource/reference errors from a prior pass. */
export function mergeMetadataValidationErrors(
  previousErrors: string[] | undefined,
  metaErrors: string[]
): { validationErrors: string[]; isValid: boolean } {
  const kept = (previousErrors || []).filter((e) => !isMetadataValidationMessage(e));
  const validationErrors = [...metaErrors, ...kept];
  return { validationErrors, isValid: validationErrors.length === 0 };
}
