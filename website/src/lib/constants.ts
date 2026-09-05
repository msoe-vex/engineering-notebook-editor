/**
 * Global constants for the Engineering Notebook project structure.
 */

export const DATA_DIR = "data";
export const ENTRIES_DIR = `${DATA_DIR}/entries`;
export const ASSETS_DIR = `${DATA_DIR}/assets`;
export const ASSETS_ORIGINAL_DIR = `${ASSETS_DIR}/original`;
export const ASSETS_COMPRESSED_DIR = `${ASSETS_DIR}/compressed`;
export const LATEX_DIR = "latex/entries";
export const INDEX_PATH = `${DATA_DIR}/notebook.json`;
export const NOTEBOOK_VERSION = 4;
export const ENTRIES_INDEX_PATH = "latex/entries.tex";
export const TEAM_PATH = "latex/team.tex";
export const PHASES_PATH = "latex/phases.tex";

// GitHub Integration
export const GITHUB_APP_INSTALL_URL = "https://github.com/apps/msoe-engineering-notebook-editor/installations/select_target";
export const GITHUB_ISSUES_URL = "https://github.com/msoe-vex/engineering-notebook-editor/issues/new";

// Human-readable labels for TipTap resource node types used in validation messages
export const TYPE_LABELS: Record<string, string> = {
	image: "image",
	table: "table",
	codeBlock: "codeBlock",
	rawLatex: "latexBlock",
	heading: "heading",
};
