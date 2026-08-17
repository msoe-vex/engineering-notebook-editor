/**
 * Default templates seeded into every new project on first open.
 * Source files live in /public/notebook-template/ and are copied from /notebook/data/.
 */

import { EntryMetadata, NotebookMetadata } from "./metadata";
import { ENTRIES_DIR } from "./constants";

const BASE_URL = "/notebook-template/data";

export interface DefaultTemplateFile {
  entryMeta: EntryMetadata;
  contentJson: string;
  filename: string;
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

/** Fetch the bundled default template index + all entry content JSON. */
export async function fetchDefaultTemplates(): Promise<DefaultTemplateFile[]> {
  try {
    const metaRes = await fetch(`${BASE_URL}/notebook.json`);
    if (!metaRes.ok) return [];
    const meta: NotebookMetadata = await metaRes.json();

    const results: DefaultTemplateFile[] = [];
    const today = new Date().toISOString();

    for (const [id, entry] of Object.entries(meta.entries)) {
      if (!entry.isTemplate) continue;

      const entryRes = await fetch(`${BASE_URL}/entries/${id}.json`);
      if (!entryRes.ok) continue;
      const contentJson = await entryRes.text();

      // Remap filename to the project's entries dir and clear author
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

      results.push({ entryMeta: cleanMeta, contentJson, filename });
    }

    return results;
  } catch (err) {
    console.warn("Failed to fetch default templates:", err);
    return [];
  }
}
