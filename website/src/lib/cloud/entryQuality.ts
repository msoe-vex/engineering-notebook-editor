import type { TipTapNode } from "@/lib/notebook/metadata";
import {
  extractReferences,
  extractResources,
  validateEntry,
  type EntryMetadata,
  type ProjectPhase,
} from "@/lib/notebook/metadata";
import type { EntryMeta } from "@/components/cloud/notebook-types";

/** Build local EntryMetadata shape for validateEntry from cloud EntryMeta. */
export function toValidatableEntry(
  entryId: string,
  meta: EntryMeta,
  extras?: {
    resources?: EntryMetadata["resources"];
    references?: string[];
  }
): EntryMetadata {
  return {
    title: meta.title || "",
    authors: meta.authors || [],
    phase: meta.phase,
    createdAt: meta.createdAt || "",
    updatedAt: meta.updatedAt || "",
    date: meta.date || "",
    filename: entryId,
    order: meta.order ?? 0,
    isTemplate: meta.isTemplate,
    resources: extras?.resources,
    references: extras?.references,
  };
}

export function analyzeEntryContent(
  entryId: string,
  meta: EntryMeta,
  doc: TipTapNode,
  phases: Record<string, ProjectPhase> | undefined,
  allEntryIds: string[]
) {
  const resources = extractResources(doc);
  const references = extractReferences(doc);
  const existingIds = new Set<string>([
    ...allEntryIds,
    ...Object.keys(resources),
  ]);
  const entry = toValidatableEntry(entryId, meta, { resources, references });
  const validationErrors = validateEntry(entry, phases || {}, existingIds);
  return {
    resources,
    references,
    validationErrors,
    isValid: validationErrors.length === 0,
  };
}
