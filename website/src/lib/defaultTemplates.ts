/**
 * Default notebook template seeded into new projects on first open.
 * Source files live in /public/notebook-template/ and are copied from /notebook/.
 */

import { EntryMetadata, NotebookMetadata, EMPTY_METADATA, validateNotebookIntegrity } from "./metadata";
import { ENTRIES_DIR } from "./constants";

const BASE_URL = "/notebook-template/data";

export interface DefaultNotebookEntry {
  filename: string;
  contentJson: string;
}

export interface DefaultNotebook {
  metadata: NotebookMetadata;
  entries: DefaultNotebookEntry[];
}

/** Fetch a static file from the bundled notebook template (e.g., main.tex or notebook.sty) */
export async function fetchNotebookTemplateFile(relativePath: string): Promise<string | null> {
  try {
    const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    const res = await fetch(`/notebook-template/${cleanPath}`);
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.warn(`Failed to fetch template file "${relativePath}":`, err);
    return null;
  }
}

/** Fetch default phases from the bundled template notebook.json. */
export async function fetchDefaultPhases(): Promise<NotebookMetadata['phases']> {
  try {
    const metaRes = await fetch(`${BASE_URL}/notebook.json`);
    if (!metaRes.ok) return [];
    const meta: NotebookMetadata = await metaRes.json();
    return meta.phases || [];
  } catch (err) {
    console.warn("Failed to fetch default phases:", err);
    return [];
  }
}

/** 
 * Fetch the complete default notebook template:
 * - Cleaned metadata with phases and template entries
 * - Raw content JSON for each template entry
 */
export async function fetchDefaultNotebook(): Promise<DefaultNotebook> {
  try {
    const metaRes = await fetch(`${BASE_URL}/notebook.json`);
    if (!metaRes.ok) {
      return { metadata: EMPTY_METADATA, entries: [] };
    }
    const meta: NotebookMetadata = await metaRes.json();

    const cleanedEntries: Record<string, EntryMetadata> = {};
    const entryContents: DefaultNotebookEntry[] = [];
    const today = new Date().toISOString();

    for (const [id, entry] of Object.entries(meta.entries || {})) {
      if (!entry.isTemplate) continue;

      const filename = `${ENTRIES_DIR}/${id}.json`;
      const cleanMeta: EntryMetadata = {
        ...entry,
        author: "",
        filename,
        createdAt: today,
        updatedAt: today,
        isValid: undefined,
        validationErrors: undefined,
      };
      cleanedEntries[id] = cleanMeta;

      const entryRes = await fetch(`${BASE_URL}/entries/${id}.json`);
      if (entryRes.ok) {
        const contentJson = await entryRes.text();
        entryContents.push({ filename, contentJson });
      }
    }

    const cleanMetadata = validateNotebookIntegrity({
      version: 3,
      entries: cleanedEntries,
      phases: meta.phases || [],
      team: {
        teamName: "",
        teamNumber: "",
        startDate: "",
        endDate: "",
        organization: "",
        members: []
      }
    });

    return {
      metadata: cleanMetadata,
      entries: entryContents
    };
  } catch (err) {
    console.warn("Failed to fetch default notebook:", err);
    return { metadata: EMPTY_METADATA, entries: [] };
  }
}
