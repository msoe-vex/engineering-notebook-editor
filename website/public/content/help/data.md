# Import & Export

Easily move your data between different workspace modes or back it up.

## Export Notebook

Use the export option by clicking the project name in the top of the editor to export a backup of your notebook. This downloads a ZIP file containing the notebook data and any optional project files that match the selected export mode. It is useful for backups or transferring your work to another workspace or team. The exported data includes:

- Notebook metadata in JSON format
- Entry content and metadata in JSON format
- All images and resources used by entries, preserved in their stored formats
- Team and phase metadata when present
- LaTeX source files when exporting the full project
- Font assets when exporting the full project and when the archive contains them

The export no longer includes a separate `notebook.index.json` manifest. The main notebook metadata file is `data/notebook.json`, which is the file the importer reads first.

## Entry Export

You can also export individual entries by right-clicking them in the sidebar. If you select multiple entries, they will be bundled into a single ZIP file. This is great for sharing specific parts of your work with other teams or for backup. Each exported entry includes:

- The entry content and metadata in JSON format
- Any associated images or resources in their original and compressed formats
- Metadata for the entry, including authorship and timestamps

Team and phase information is not included in entry exports, as they are meant to be portable and reusable across different contexts.

## Import Notebook

Upload a previously exported ZIP file to restore or transfer your work between workspace modes (Local, Temporary, or GitHub). Importing is interactive and safe — the app stages and validates the uploaded data before making any permanent changes.

Key points about notebook imports:

- Validation: the importer reads `data/notebook.json` early and stages the archive in memory before any writes. This prevents partial or corrupted imports.
- Prompt & Confirmation: you will be shown an import dialog summarizing the impact, including how many entries will be replaced, added, or removed. You then confirm the exact overwrite choices before changes are applied.
- Team & Phases: by default a full-notebook import will offer to overwrite team and phase metadata. Those checkboxes are disabled when the uploaded archive does not contain team or phase data.
- Temporary workspaces: clearing existing entries is only performed when you explicitly choose the "Clear" import mode. Importing in other modes will not unconditionally delete your current entries.
- Project files: if the archive contains `main.tex`, `notebook.sty`, or font assets, the dialog lets you opt into those overwrites separately. Turning the parent project-files toggle off does not erase your per-file selections.

Entry import modes (choose in the import dialog):

- **Replace** (default): overwrite entries that share the same IDs with the imported versions; new entries in the archive are added as-is.
- **Keep**: preserve your existing entries; if an imported entry collides with an existing ID the imported entry will be added as a new entry with a remapped ID to avoid breaking links.
- **Clear**: delete all existing entries in the current workspace and then import all entries from the archive.
- **None**: skip importing entries (useful when you only want to import team/phase metadata or assets).

Export behavior notes relevant to imports:

- Exports respect staged changes (pending deletes and updates). Files you have marked for deletion will not be resurrected by exporting then importing the same archive.
- Full project exports include notebook metadata, entries, assets, team and phase metadata, LaTeX sources, and any bundled font assets.

If you'd like a clean slate before importing, choose the "Clear" mode in the import dialog. Otherwise, use "Replace" or "Keep" depending on whether you want imported IDs preserved or kept alongside your existing entries.
