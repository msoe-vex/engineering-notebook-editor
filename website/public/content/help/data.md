# Import & Export

Easily move your data between different workspace modes or back it up.

## Export Notebook

Use the export option by clicking the project name in the top of the editor to export a full backup of your entire notebook. This will download a ZIP file containing all your entries, images, and metadata in a structured format. This is useful for creating backups or transferring your work to another workspace or team. The exported data includes:

- Notebook and entries in JSON format
- All images and resources in their original and compressed formats
- Metadata files for team info and project phases
- LaTeX source files for the entire notebook, allowing you to compile it locally if desired

## Entry Export

You can also export individual entries by right-clicking them in the sidebar. If you select multiple entries, they will be bundled into a single ZIP file. This is great for sharing specific parts of your work with other teams or for backup. Each exported entry includes:

- The entry content and metadata in JSON format
- Any associated images or resources in their original and compressed formats
- Metadata for the entry, including authorship and timestamps

Team and phase information is not included in entry exports, as they are meant to be portable and reusable across different contexts.

## Import Notebook

Upload a previously exported ZIP file to restore or transfer your work between workspace modes (Local, Temporary, or GitHub). Importing is interactive and safe — the app stages and validates the uploaded data before making any permanent changes.

Key points about notebook imports:

- Validation: the notebook index (notebook.json) is validated early and the archive is staged in memory before any writes. This prevents partial or corrupted imports.
- Prompt & Confirmation: you will be shown an import dialog summarizing the impact (how many entries will be replaced, added, or removed) and asked to choose how entries should be handled. A final confirmation is required before changes are applied.
- Team & Phases: by default a full-notebook import will offer to overwrite team and phase metadata. Those checkboxes are disabled when the uploaded archive does not contain team or phase data.
- Temporary workspaces: clearing existing entries is only performed when you explicitly choose the "Clear" import mode. Importing in other modes will not unconditionally delete your current entries.

Entry import modes (choose in the import dialog):

- **Replace** (default): overwrite entries that share the same IDs with the imported versions; new entries in the archive are added as-is.
- **Keep**: preserve your existing entries; if an imported entry collides with an existing ID the imported entry will be added as a new entry with a remapped ID to avoid breaking links.
- **Clear**: delete all existing entries in the current workspace and then import all entries from the archive.
- **None**: skip importing entries (useful when you only want to import team/phase metadata or assets).

Export behavior notes relevant to imports:

- Exports respect staged changes (pending deletes and updates). Files you have marked for deletion will not be resurrected by exporting then importing the same archive.
- Full notebook exports include the notebook and entries in JSON format, all assets (images/resources), team and phase metadata, and LaTeX source files.

If you'd like a clean slate before importing, choose the "Clear" mode in the import dialog. Otherwise, use "Replace" or "Keep" depending on whether you want imported IDs preserved or kept alongside your existing entries.
