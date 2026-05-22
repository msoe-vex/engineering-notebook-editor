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

Upload a previously exported ZIP file to restore your work into any workspace. This is useful if you want to switch from a Temporary workspace to a GitHub one.

If you import an whole notebook, it will overwrite all team and phase metadata, but any existing entries will be preserved. You can delete all entries before importing if you want a clean slate.

When importing individual entries, they will be added to your current workspace without affecting existing entries. Existing team and phase metadata will not be modified.
