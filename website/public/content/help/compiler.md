# Compile & PDF

Notebook PDFs are built by a **server XeLaTeX job** (not an in-browser BusyTeX default). Open the notebook **Compile** tab to run jobs, browse versions, and manage share links.

## How it works

1. Click **Compile** (or equivalent CTA) on the Compile page.
2. Core enqueues a compile job; the worker pulls entries and assets.
3. Progress shows a **percent bar** and the **current status** line only.
4. On success, a new export version is stored (up to 10). `latest` points at the newest PDF.

Templates, trashed entries, and entries marked **Hide from PDF** are excluded.

## Versions & share links

- Keep up to **10** PDF versions; delete older ones if compile returns a limit error.
- Org admins/owners can publish or revoke **public PDF links** from Compile when enabled.

## Troubleshooting

- Read the failure alert / log on the Compile page (not only the browser console).
- Prefer PNG/JPEG images; huge assets slow jobs.
- If progress stalls, wait for the job timeout or start a new compile after checking Core/worker health locally.

Optional local BusyTeX is an escape hatch only when explicitly enabled for development — not the production path.
